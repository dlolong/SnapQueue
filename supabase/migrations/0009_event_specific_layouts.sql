-- One event-owned layout, copied from the template library and customized per event.
alter table public.event_guest_settings
  add column if not exists layout_template_id uuid references public.templates(id) on delete restrict,
  add column if not exists layout_name text,
  add column if not exists layout_config jsonb,
  add column if not exists layout_width_px integer,
  add column if not exists layout_height_px integer,
  add column if not exists layout_dpi integer,
  add column if not exists layout_version integer not null default 0;

-- Existing events get one deterministic starting layout from their enabled templates.
with chosen as (
  select distinct on (et.event_id) et.event_id, et.template_id, t.name, t.layout_config, t.width_px, t.height_px, t.dpi
  from public.event_guest_templates et
  join public.templates t on t.id=et.template_id
  order by et.event_id, t.is_system desc, t.name, t.id
)
update public.event_guest_settings s set
  layout_template_id=c.template_id,
  layout_name=c.name,
  layout_config=c.layout_config,
  layout_width_px=c.width_px,
  layout_height_px=c.height_px,
  layout_dpi=c.dpi,
  layout_version=1
from chosen c where c.event_id=s.event_id and s.layout_config is null;

with ranked as (
  select event_id,template_id,row_number() over(partition by event_id order by created_at,template_id) as position
  from public.event_guest_templates
)
delete from public.event_guest_templates et using ranked r
where et.event_id=r.event_id and et.template_id=r.template_id and r.position>1;
create unique index if not exists idx_event_guest_templates_one_per_event on public.event_guest_templates(event_id);

alter table public.print_jobs
  add column if not exists layout_version integer not null default 0,
  add column if not exists layout_snapshot jsonb not null default '{}'::jsonb;
update public.print_jobs j set
  layout_version=coalesce(nullif(j.layout_version,0),1),
  layout_snapshot=jsonb_build_object('template_id',t.id,'name',t.name,'width_px',t.width_px,'height_px',t.height_px,'dpi',t.dpi,'layout_config',t.layout_config)
from public.templates t where t.id=j.selected_template_id and j.layout_snapshot='{}'::jsonb;
alter table public.print_jobs drop constraint if exists print_jobs_layout_snapshot_object;
alter table public.print_jobs add constraint print_jobs_layout_snapshot_object check(jsonb_typeof(layout_snapshot)='object');

create or replace function public.ensure_event_guest_defaults()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.event_guest_settings(event_id,workspace_id) values(new.id,new.workspace_id) on conflict(event_id) do nothing;
  return new;
end; $$;

create or replace function public.validate_event_guest_template_tenant()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare event_workspace uuid; template_workspace uuid; system_template boolean;
begin
  select workspace_id into event_workspace from public.events where id=new.event_id;
  select workspace_id,is_system into template_workspace,system_template from public.templates where id=new.template_id;
  if not found or event_workspace is null or new.workspace_id<>event_workspace or (system_template is not true and template_workspace is distinct from event_workspace) then
    raise exception 'Template must be system-owned or belong to the event workspace';
  end if;
  return new;
end; $$;

create or replace function public.save_event_layout(
  p_event_id uuid,p_template_id uuid,p_layout_name text,p_layout_config jsonb,p_activate boolean default false
) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare ws uuid; ver integer; tpl public.templates%rowtype; el jsonb; cw integer; ch integer; dpi_value integer;
begin
  select workspace_id into ws from public.events where id=p_event_id;
  if ws is null or not public.can_edit_workspace(ws) then raise exception 'Workspace access denied'; end if;
  select * into tpl from public.templates where id=p_template_id and (is_system or workspace_id=ws);
  if not found then raise exception 'Choose a template in this workspace'; end if;
  if length(trim(coalesce(p_layout_name,''))) not between 2 and 120 then raise exception 'Layout name must be 2–120 characters'; end if;
  if p_layout_config is null or jsonb_typeof(p_layout_config) is distinct from 'object' or jsonb_typeof(p_layout_config->'canvas') is distinct from 'object' or jsonb_typeof(p_layout_config->'elements') is distinct from 'array' then raise exception 'Invalid layout configuration'; end if;
  cw:=(p_layout_config#>>'{canvas,width}')::integer; ch:=(p_layout_config#>>'{canvas,height}')::integer; dpi_value:=(p_layout_config#>>'{canvas,dpi}')::integer;
  if cw is null or ch is null or dpi_value is null or cw<1 or cw>5000 or ch<1 or ch>5000 or dpi_value<72 or dpi_value>1200 then raise exception 'Invalid layout canvas dimensions or DPI'; end if;
  if jsonb_array_length(p_layout_config->'elements')<1 or jsonb_array_length(p_layout_config->'elements')>200 then raise exception 'Layout must contain between 1 and 200 elements'; end if;
  if not exists(select 1 from jsonb_array_elements(p_layout_config->'elements') x where x->>'type'='photo') then raise exception 'Add at least one photo placeholder'; end if;
  for el in select value from jsonb_array_elements(p_layout_config->'elements') loop
    if coalesce(el->>'id','')='' or coalesce(el->>'type','') not in ('photo','text','shape') then raise exception 'Layout has an unsupported element'; end if;
    if coalesce((el->>'width')::numeric,0)<1 or coalesce((el->>'height')::numeric,0)<1 or coalesce((el->>'x')::numeric,-1)<0 or coalesce((el->>'y')::numeric,-1)<0 or coalesce((el->>'x')::numeric,0)+(el->>'width')::numeric>cw or coalesce((el->>'y')::numeric,0)+(el->>'height')::numeric>ch then raise exception 'Layout element coordinates are outside the print canvas'; end if;
  end loop;
  if p_layout_config#>>'{overlay,path}' is not null and p_layout_config#>>'{overlay,path}' not like ws::text||'/templates/%' then raise exception 'Overlay asset is outside this workspace'; end if;
  update public.event_guest_settings set
    layout_template_id=p_template_id,layout_name=trim(p_layout_name),layout_config=p_layout_config,
    layout_width_px=cw,layout_height_px=ch,layout_dpi=dpi_value,layout_version=layout_version+1,updated_at=now()
  where event_id=p_event_id and workspace_id=ws returning layout_version into ver;
  if ver is null then raise exception 'Event guest settings are missing'; end if;
  delete from public.event_guest_templates where event_id=p_event_id and workspace_id=ws;
  insert into public.event_guest_templates(workspace_id,event_id,template_id) values(ws,p_event_id,p_template_id);
  if p_activate then update public.events set status='active',updated_at=now() where id=p_event_id and workspace_id=ws; end if;
  return ver;
end; $$;

create or replace function public.require_event_layout_before_activation()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status='active' and not exists(
    select 1 from public.event_guest_settings s
    where s.event_id=new.id and s.workspace_id=new.workspace_id and s.layout_template_id is not null
      and jsonb_typeof(s.layout_config)='object' and s.layout_width_px>0 and s.layout_height_px>0 and s.layout_dpi>=72
      and exists(select 1 from jsonb_array_elements(coalesce(s.layout_config->'elements','[]'::jsonb)) e where e->>'type'='photo')
      and (select count(*) from public.event_guest_templates et where et.event_id=new.id)=1
  ) then raise exception 'Configure one valid event layout before activating this event'; end if;
  return new;
end; $$;
drop trigger if exists require_event_layout_before_activation on public.events;
create trigger require_event_layout_before_activation before insert or update of status on public.events
for each row execute function public.require_event_layout_before_activation();

create or replace function public.save_event_guest_settings(p_event_id uuid,p_settings jsonb,p_template_ids uuid[])
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare ws uuid; tid uuid;
begin
  select workspace_id into ws from public.events where id=p_event_id;
  if ws is null or not public.can_edit_workspace(ws) then raise exception 'Workspace access denied'; end if;
  if jsonb_typeof(p_settings->'print_packages')<>'array' or jsonb_array_length(p_settings->'print_packages')<1 or jsonb_array_length(p_settings->'print_packages')>12 then raise exception 'Configure between 1 and 12 print packages'; end if;
  if jsonb_typeof(p_settings->'print_sizes')<>'array' or jsonb_array_length(p_settings->'print_sizes')=0 then raise exception 'Select available print sizes'; end if;
  if exists(select 1 from jsonb_array_elements(p_settings->'print_packages') p where coalesce(p->>'code','') !~ '^[a-z0-9_-]{1,24}$' or length(coalesce(p->>'label','')) not between 1 and 80 or coalesce((p->>'quantity')::integer,0)<1 or (p->>'quantity')::integer>100) then raise exception 'Invalid print package'; end if;
  if exists(select 1 from jsonb_array_elements(p_settings->'print_packages') p group by p->>'code' having count(*)>1) then raise exception 'Print package codes must be unique'; end if;
  if exists(select 1 from jsonb_array_elements(p_settings->'print_packages') p where (p->>'quantity')::integer>(p_settings->>'max_print_quantity')::integer) then raise exception 'A package exceeds the maximum print quantity'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_settings->'print_sizes') s where s not in ('2x6','4x6','4x4')) then raise exception 'Unsupported print size'; end if;
  if coalesce(cardinality(p_template_ids),0)<>1 then raise exception 'Each event must have exactly one layout'; end if;
  if not exists(select 1 from public.event_guest_settings s where s.event_id=p_event_id and s.workspace_id=ws and s.layout_template_id=p_template_ids[1]) then raise exception 'Choose the event layout in the layout editor'; end if;
  update public.event_guest_settings set
    print_sizes=array(select distinct jsonb_array_elements_text(p_settings->'print_sizes')),
    print_packages=p_settings->'print_packages',
    max_photos_per_guest=(p_settings->>'max_photos_per_guest')::integer,
    max_photo_size_bytes=(p_settings->>'max_photo_size_bytes')::integer,
    max_print_quantity=(p_settings->>'max_print_quantity')::integer,
    approval_mode=p_settings->>'approval_mode',guest_instructions=left(p_settings->>'guest_instructions',1000),
    marketing_consent_enabled=(p_settings->>'marketing_consent_enabled')::boolean,
    photo_retention_days=(p_settings->>'photo_retention_days')::integer,updated_at=now()
  where event_id=p_event_id and workspace_id=ws;
end; $$;

create or replace function public.get_public_guest_event(p_code text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'code',e.public_event_code,'name',e.name,'event_type',e.event_type,'event_date',e.event_date,
    'venue',e.venue,'primary_color',coalesce(e.primary_color,'#6658e8'),'secondary_color',coalesce(e.secondary_color,'#171b25'),
    'guest_instructions',s.guest_instructions,'print_sizes',s.print_sizes,'print_packages',s.print_packages,
    'max_photos_per_guest',s.max_photos_per_guest,'max_photo_size_bytes',s.max_photo_size_bytes,
    'max_print_quantity',s.max_print_quantity,'marketing_consent_enabled',s.marketing_consent_enabled,
    'layout',jsonb_build_object('template_id',s.layout_template_id,'name',s.layout_name,'width_px',s.layout_width_px,
      'height_px',s.layout_height_px,'dpi',s.layout_dpi,'version',s.layout_version,'layout_config',s.layout_config)
  )
  from public.events e join public.event_guest_settings s on s.event_id=e.id and s.workspace_id=e.workspace_id
  where e.public_event_code=p_code and e.guest_portal_enabled and e.status='active'
    and s.layout_template_id is not null and jsonb_typeof(s.layout_config)='object'
$$;

create or replace function public.submit_guest_print_job(
  p_code text,p_access_token_hash text,p_tracking_token_hash text,p_template_id uuid,p_package_code text,
  p_design jsonb,p_final_export_path text,p_quantity integer,p_size text,p_marketing_consent boolean
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare auth_data jsonb; e public.events%rowtype; s public.event_guest_settings%rowtype; t public.templates%rowtype;
  sid uuid; seq bigint; qno text; ref text; job_status text; el jsonb; photo_id uuid;
begin
  if p_tracking_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid tracking token'; end if;
  auth_data:=public.verify_guest_session(p_code,p_access_token_hash);
  if auth_data is null then raise exception 'Guest session expired or unavailable'; end if;
  sid:=(auth_data->>'guest_session_id')::uuid;
  select * into e from public.events where id=(auth_data->>'event_id')::uuid and guest_portal_enabled and status='active';
  select * into s from public.event_guest_settings where event_id=e.id and workspace_id=e.workspace_id;
  if s.layout_template_id is null or s.layout_template_id<>p_template_id or jsonb_typeof(s.layout_config)<>'object' then raise exception 'This event does not have an active layout'; end if;
  select * into t from public.templates tp where tp.id=s.layout_template_id and (tp.is_system or tp.workspace_id=e.workspace_id);
  if not found then raise exception 'Event layout source is unavailable'; end if;
  if p_size<>all(s.print_sizes) then raise exception 'Print size is not available for this event'; end if;
  if p_quantity<1 or p_quantity>s.max_print_quantity then raise exception 'Print quantity is outside event limits'; end if;
  if not exists(select 1 from jsonb_array_elements(s.print_packages) pkg where pkg->>'code'=p_package_code and (pkg->>'quantity')::integer=p_quantity) then raise exception 'Print package is not available for this event'; end if;
  if s.marketing_consent_enabled and p_marketing_consent is null then raise exception 'Marketing consent choice is required'; end if;
  if jsonb_typeof(p_design)<>'object' or (p_design->>'version')::integer not in (1,2) or jsonb_typeof(p_design->'elements')<>'array' or jsonb_array_length(p_design->'elements')>200 then raise exception 'Invalid design model'; end if;
  if (p_design#>>'{canvas,width}')::integer<>s.layout_width_px or (p_design#>>'{canvas,height}')::integer<>s.layout_height_px or (p_design#>>'{canvas,dpi}')::integer<>s.layout_dpi then raise exception 'Design dimensions must match the event layout'; end if;
  if jsonb_array_length(p_design->'elements')<>jsonb_array_length(coalesce(s.layout_config->'elements','[]'::jsonb)) then raise exception 'Design layers must match the event layout'; end if;
  if exists(
    select 1 from jsonb_array_elements(p_design->'elements') guest_element
    where not exists(
      select 1 from jsonb_array_elements(coalesce(s.layout_config->'elements','[]'::jsonb)) template_element
      where template_element->>'type'=guest_element->>'type' and template_element->>'id'=guest_element->>'id'
        and template_element->>'x'=guest_element->>'x' and template_element->>'y'=guest_element->>'y'
        and template_element->>'width'=guest_element->>'width' and template_element->>'height'=guest_element->>'height'
        and coalesce(template_element->>'rotation','0')=coalesce(guest_element->>'rotation','0')
    )
  ) then raise exception 'Design layers must match the event layout'; end if;
  if exists(
    select 1 from jsonb_array_elements(coalesce(s.layout_config->'elements','[]'::jsonb)) template_element
    where template_element->>'type'='photo' and coalesce((template_element->>'visible')::boolean,true)
      and coalesce((template_element->>'required')::boolean,coalesce((s.layout_config->>'photo_slots_required')::boolean,true))
      and not exists(select 1 from jsonb_array_elements(p_design->'elements') guest_element
        where guest_element->>'type'='photo' and guest_element->>'id'=template_element->>'id'
          and coalesce(guest_element->>'photoId','') ~ '^[0-9a-fA-F-]{36}$')
  ) then raise exception 'Assign a photo to every required slot'; end if;
  for el in select value from jsonb_array_elements(p_design->'elements') loop
    if el->>'type' not in ('photo','text','shape') then raise exception 'Unsupported design element'; end if;
    if el->>'type'='photo' and coalesce(el->>'photoId','')<>'' then
      if (el->>'photoId') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Invalid photo slot assignment'; end if;
      photo_id:=(el->>'photoId')::uuid;
      if not exists(select 1 from public.guest_photos gp where gp.id=photo_id and gp.guest_session_id=sid and gp.event_id=e.id) then raise exception 'Photo does not belong to this guest session'; end if;
    end if;
  end loop;
  if p_final_export_path not like e.public_event_code||'/'||sid::text||'/%' then raise exception 'Invalid export path'; end if;
  insert into public.event_queue_counters(event_id,last_number) values(e.id,0) on conflict(event_id) do nothing;
  update public.event_queue_counters set last_number=last_number+1 where event_id=e.id returning last_number into seq;
  qno:=e.queue_prefix||'-'||lpad(seq::text,3,'0');
  ref:='SQ-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  job_status:=case when s.approval_mode='manual' then 'pending_approval' when s.queue_paused then 'submitted' else 'queued' end;
  insert into public.print_jobs(workspace_id,event_id,guest_session_id,queue_number,queue_position,order_reference,tracking_token_hash,selected_template_id,design_config,final_export_path,print_quantity,print_size,package_code,status,marketing_consent,layout_version,layout_snapshot)
  values(e.workspace_id,e.id,sid,qno,seq,ref,p_tracking_token_hash,s.layout_template_id,p_design,p_final_export_path,p_quantity,p_size,p_package_code,job_status,coalesce(p_marketing_consent,false),s.layout_version,jsonb_build_object('template_id',s.layout_template_id,'name',s.layout_name,'width_px',s.layout_width_px,'height_px',s.layout_height_px,'dpi',s.layout_dpi,'layout_config',s.layout_config));
  return jsonb_build_object('queue_number',qno,'order_reference',ref,'status',job_status,'template_name',s.layout_name,'print_quantity',p_quantity,'print_size',p_size,'package_code',p_package_code,'layout_version',s.layout_version);
end; $$;

create or replace function public.operate_print_queue(p_event_id uuid,p_job_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.print_jobs%rowtype; e public.events%rowtype; seq bigint; new_id uuid; next_status text;
begin
  if auth.uid() is null or not public.can_edit_workspace((select workspace_id from public.events where id=p_event_id)) then raise exception 'Workspace access denied'; end if;
  select * into e from public.events where id=p_event_id;
  if not found then raise exception 'Event not found'; end if;
  if p_action in ('pause','resume') then
    update public.event_guest_settings set queue_paused=(p_action='pause'),updated_at=now() where event_id=p_event_id;
    if p_action='resume' then update public.print_jobs set status='queued' where event_id=p_event_id and status='submitted'; end if;
    return jsonb_build_object('paused',p_action='pause');
  end if;
  select * into j from public.print_jobs where id=p_job_id and event_id=p_event_id for update;
  if not found then raise exception 'Print job not found'; end if;
  if p_action='approve' and j.status='pending_approval' then next_status:='queued';
  elsif p_action='reject' and j.status='pending_approval' then next_status:='rejected';
  elsif p_action='cancel' and j.status in ('submitted','pending_approval','queued') then next_status:='cancelled';
  elsif p_action='retry' and j.status='failed' then next_status:='queued';
  elsif p_action='mark_ready' and j.status in ('queued','printing') then next_status:='ready_for_pickup';
  elsif p_action='claim' and j.status='ready_for_pickup' then next_status:='completed';
  elsif p_action='prioritize' and j.status='queued' then
    update public.print_jobs set priority=priority+1 where id=j.id returning * into j;
    return jsonb_build_object('job_id',j.id,'status',j.status,'priority',j.priority);
  elsif p_action='reprint' and j.status='completed' then
    insert into public.event_queue_counters(event_id,last_number) values(e.id,0) on conflict(event_id) do nothing;
    update public.event_queue_counters set last_number=last_number+1 where event_id=e.id returning last_number into seq;
    insert into public.print_jobs(workspace_id,event_id,guest_session_id,queue_number,queue_position,order_reference,selected_template_id,design_config,final_export_path,print_quantity,print_size,package_code,status,priority,layout_version,layout_snapshot)
    values(j.workspace_id,j.event_id,j.guest_session_id,e.queue_prefix||'-'||lpad(seq::text,3,'0'),seq,'SQ-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),j.selected_template_id,j.design_config,j.final_export_path,j.print_quantity,j.print_size,j.package_code,'queued',j.priority,j.layout_version,j.layout_snapshot)
    returning id into new_id;
    return jsonb_build_object('job_id',new_id,'status','queued');
  else raise exception 'Action is not valid for job status %',p_action;
  end if;
  update public.print_jobs set status=next_status,attempt_count=case when p_action='retry' then attempt_count+1 else attempt_count end,
    failure_reason=case when p_action='retry' then null else failure_reason end,
    completed_at=case when next_status='completed' then now() else completed_at end
  where id=j.id returning * into j;
  return jsonb_build_object('job_id',j.id,'status',j.status,'queue_number',j.queue_number);
end; $$;

revoke all on function public.save_event_layout(uuid,uuid,text,jsonb,boolean) from public;
grant execute on function public.save_event_layout(uuid,uuid,text,jsonb,boolean) to authenticated;
revoke all on function public.submit_guest_print_job(text,text,text,uuid,text,jsonb,text,integer,text,boolean) from public;
grant execute on function public.submit_guest_print_job(text,text,text,uuid,text,jsonb,text,integer,text,boolean) to service_role;
revoke all on function public.get_public_guest_event(text) from public;
grant execute on function public.get_public_guest_event(text) to anon,authenticated;
revoke all on function public.save_event_guest_settings(uuid,jsonb,uuid[]) from public;
grant execute on function public.save_event_guest_settings(uuid,jsonb,uuid[]) to authenticated;
revoke all on function public.operate_print_queue(uuid,uuid,text) from public;
grant execute on function public.operate_print_queue(uuid,uuid,text) to authenticated;

create or replace function public.require_guest_layout_before_enable()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.guest_portal_enabled and not exists(
    select 1 from public.event_guest_settings s
    where s.event_id=new.id and s.workspace_id=new.workspace_id and s.layout_template_id is not null
      and jsonb_typeof(s.layout_config)='object' and s.layout_width_px>0 and s.layout_height_px>0 and s.layout_dpi>=72
      and exists(select 1 from jsonb_array_elements(coalesce(s.layout_config->'elements','[]'::jsonb)) e where e->>'type'='photo')
  ) then raise exception 'Configure a valid event layout before enabling guest ordering'; end if;
  return new;
end; $$;
drop trigger if exists require_guest_layout_before_enable on public.events;
create trigger require_guest_layout_before_enable before insert or update of guest_portal_enabled on public.events
for each row execute function public.require_guest_layout_before_enable();

create or replace function public.get_guest_order(p_tracking_token_hash text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('queue_number',j.queue_number,'order_reference',j.order_reference,'status',j.status,
    'template_name',coalesce(j.layout_snapshot->>'name',t.name),'print_quantity',j.print_quantity,'print_size',j.print_size,'submitted_at',j.submitted_at,
    'queue_ahead',(select count(*) from public.print_jobs ahead where ahead.event_id=j.event_id and ahead.status in ('queued','printing')
      and (ahead.priority>j.priority or (ahead.priority=j.priority and ahead.queue_position<j.queue_position))))
  from public.print_jobs j left join public.templates t on t.id=j.selected_template_id
  where j.tracking_token_hash=p_tracking_token_hash and j.tracking_token_hash is not null
$$;
