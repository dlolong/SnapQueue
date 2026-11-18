-- Public event QR guest ordering. Public traffic can only reach the narrow
-- SECURITY DEFINER RPCs below; guest tables and objects remain private.
create extension if not exists pgcrypto;

alter table public.events
  add column if not exists public_event_code text,
  add column if not exists guest_portal_enabled boolean not null default false,
  add column if not exists queue_prefix text not null default 'A';
update public.events set public_event_code=substr(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),1,48) where public_event_code is null;
alter table public.events alter column public_event_code set default substr(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),1,48);
alter table public.events alter column public_event_code set not null;
create unique index if not exists idx_events_public_code on public.events(public_event_code);
alter table public.events drop constraint if exists events_queue_prefix_check;
alter table public.events add constraint events_queue_prefix_check check(queue_prefix ~ '^[A-Z0-9]{1,4}$');

create table if not exists public.event_guest_settings (
  event_id uuid primary key references public.events(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  print_sizes text[] not null default array['2x6','4x6','4x4']::text[],
  print_packages jsonb not null default '[{"code":"single","label":"Single print","quantity":1}]'::jsonb,
  max_photos_per_guest integer not null default 8 check(max_photos_per_guest between 1 and 20),
  max_photo_size_bytes integer not null default 10485760 check(max_photo_size_bytes between 1024 and 20971520),
  min_photo_width integer not null default 300 check(min_photo_width between 1 and 12000),
  min_photo_height integer not null default 300 check(min_photo_height between 1 and 12000),
  max_photo_pixels bigint not null default 40000000 check(max_photo_pixels between 10000 and 100000000),
  max_print_quantity integer not null default 10 check(max_print_quantity between 1 and 100),
  approval_mode text not null default 'automatic' check(approval_mode in ('automatic','manual')),
  guest_instructions text not null default '',
  marketing_consent_enabled boolean not null default false,
  photo_retention_days integer not null default 30 check(photo_retention_days between 1 and 365),
  queue_paused boolean not null default false,
  updated_at timestamptz not null default now(),
  check(jsonb_typeof(print_packages)='array'),
  check(cardinality(print_sizes)>0)
);

create table if not exists public.event_guest_templates (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  template_id uuid not null references public.templates(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(event_id,template_id)
);
create or replace function public.validate_event_guest_template_tenant()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare event_workspace uuid; template_workspace uuid; system_template boolean;
begin
  select workspace_id into event_workspace from public.events where id=new.event_id;
  select workspace_id,is_system into template_workspace,system_template from public.templates where id=new.template_id and is_active;
  if not found or event_workspace is null or new.workspace_id<>event_workspace or (system_template is not true and template_workspace is distinct from event_workspace) then
    raise exception 'Template must be active and system-owned or belong to the event workspace';
  end if;
  return new;
end; $$;
drop trigger if exists validate_event_guest_template_tenant on public.event_guest_templates;
create trigger validate_event_guest_template_tenant before insert or update on public.event_guest_templates
for each row execute function public.validate_event_guest_template_tenant();

create table if not exists public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  access_token_hash text not null unique check(access_token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '7 days',
  revoked_at timestamptz
);

create table if not exists public.guest_photos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  guest_session_id uuid not null references public.guest_sessions(id) on delete cascade,
  object_path text not null unique,
  filename text not null,
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
  file_size bigint not null check(file_size>0),
  width_px integer not null check(width_px>0),
  height_px integer not null check(height_px>0),
  created_at timestamptz not null default now()
);

create table if not exists public.event_queue_counters (
  event_id uuid primary key references public.events(id) on delete cascade,
  last_number bigint not null default 0 check(last_number>=0)
);

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  guest_session_id uuid not null references public.guest_sessions(id) on delete restrict,
  queue_number text not null,
  queue_position bigint not null check(queue_position>0),
  order_reference text not null unique,
  tracking_token_hash text unique check(tracking_token_hash is null or tracking_token_hash ~ '^[a-f0-9]{64}$'),
  selected_template_id uuid not null references public.templates(id) on delete restrict,
  design_config jsonb not null check(jsonb_typeof(design_config)='object'),
  final_export_path text not null,
  print_quantity integer not null check(print_quantity between 1 and 100),
  print_size text not null check(print_size in ('2x6','4x6','4x4')),
  package_code text not null default 'single',
  status text not null default 'submitted' check(status in ('submitted','pending_approval','queued','printing','ready_for_pickup','completed','failed','cancelled','rejected')),
  priority integer not null default 0,
  attempt_count integer not null default 0 check(attempt_count>=0),
  submitted_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now(),
  unique(event_id,queue_number),
  unique(event_id,queue_position)
);

-- This migration may be rerun after an earlier partial version created
-- print_jobs without queue_position. CREATE TABLE IF NOT EXISTS does not add
-- newly declared columns to an existing table, so add and backfill it here.
alter table public.print_jobs add column if not exists queue_position bigint;
with ranked_jobs as (
  select j.id,
    coalesce((select max(existing.queue_position) from public.print_jobs existing where existing.event_id=j.event_id),0)
      + row_number() over (partition by j.event_id order by j.submitted_at,j.created_at,j.id) as position
  from public.print_jobs j
  where j.queue_position is null
)
update public.print_jobs j set queue_position=r.position
from ranked_jobs r where r.id=j.id;
alter table public.print_jobs alter column queue_position set not null;
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.print_jobs'::regclass
      and conname='print_jobs_event_id_queue_position_key'
  ) then
    alter table public.print_jobs
      add constraint print_jobs_event_id_queue_position_key unique(event_id,queue_position);
  end if;
end $$;

create table if not exists public.guest_rate_limits (
  scope_hash text primary key check(scope_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  hit_count integer not null check(hit_count>=0),
  updated_at timestamptz not null default now()
);

create index if not exists idx_guest_sessions_event_expiry on public.guest_sessions(event_id,expires_at);
create index if not exists idx_guest_photos_session_created on public.guest_photos(guest_session_id,created_at);
create index if not exists idx_print_jobs_event_queue on public.print_jobs(event_id,status,priority desc,submitted_at);
create index if not exists idx_print_jobs_workspace_created on public.print_jobs(workspace_id,created_at desc);
create index if not exists idx_print_jobs_tracking_hash on public.print_jobs(tracking_token_hash) where tracking_token_hash is not null;

alter table public.event_guest_settings enable row level security;
alter table public.event_guest_templates enable row level security;
alter table public.guest_sessions enable row level security;
alter table public.guest_photos enable row level security;
alter table public.event_queue_counters enable row level security;
alter table public.print_jobs enable row level security;
alter table public.guest_rate_limits enable row level security;

drop policy if exists "members read guest settings" on public.event_guest_settings;
create policy "members read guest settings" on public.event_guest_settings for select using(public.is_workspace_member(workspace_id));
drop policy if exists "operators manage guest settings" on public.event_guest_settings;
create policy "operators manage guest settings" on public.event_guest_settings for all using(public.can_edit_workspace(workspace_id)) with check(public.can_edit_workspace(workspace_id));
drop policy if exists "members read guest templates" on public.event_guest_templates;
create policy "members read guest templates" on public.event_guest_templates for select using(public.is_workspace_member(workspace_id));
drop policy if exists "operators manage guest templates" on public.event_guest_templates;
create policy "operators manage guest templates" on public.event_guest_templates for all using(public.can_edit_workspace(workspace_id)) with check(public.can_edit_workspace(workspace_id));
drop policy if exists "members read print jobs" on public.print_jobs;
create policy "members read print jobs" on public.print_jobs for select using(public.can_edit_workspace(workspace_id));
drop policy if exists "members read guest photos" on public.guest_photos;
create policy "members read guest photos" on public.guest_photos for select using(public.is_workspace_member(workspace_id));
-- No anon policies on guest sessions/photos/jobs/counters/rate limits. Guests use
-- hash-authenticated RPCs; trusted server routes use the service role for objects.

grant select,insert,update,delete on public.event_guest_settings,public.event_guest_templates to authenticated;
grant select on public.print_jobs,public.guest_photos to authenticated;
revoke all on public.guest_sessions,public.event_queue_counters,public.guest_rate_limits from anon,authenticated;
revoke all on public.print_jobs,public.guest_photos from anon;
grant usage on schema public to anon,authenticated;
grant usage on schema public to service_role;
grant select,insert,update,delete on public.event_guest_settings,public.event_guest_templates,
  public.guest_sessions,public.guest_photos,public.event_queue_counters,public.print_jobs,public.guest_rate_limits
  to service_role;

create or replace function public.ensure_event_guest_defaults()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.event_guest_settings(event_id,workspace_id) values(new.id,new.workspace_id) on conflict(event_id) do nothing;
  insert into public.event_guest_templates(workspace_id,event_id,template_id)
    select new.workspace_id,new.id,t.id from public.templates t
    where t.is_active and (t.is_system or t.workspace_id=new.workspace_id)
    on conflict(event_id,template_id) do nothing;
  return new;
end; $$;
drop trigger if exists ensure_event_guest_defaults on public.events;
create trigger ensure_event_guest_defaults after insert on public.events for each row execute function public.ensure_event_guest_defaults();
insert into public.event_guest_settings(event_id,workspace_id)
select e.id,e.workspace_id from public.events e on conflict(event_id) do nothing;
insert into public.event_guest_templates(workspace_id,event_id,template_id)
select e.workspace_id,e.id,t.id from public.events e join public.templates t on t.is_active and (t.is_system or t.workspace_id=e.workspace_id)
on conflict(event_id,template_id) do nothing;

create or replace function public.save_event_guest_settings(p_event_id uuid,p_settings jsonb,p_template_ids uuid[])
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare ws uuid; tid uuid;
begin
  select workspace_id into ws from public.events where id=p_event_id;
  if ws is null or not public.can_edit_workspace(ws) then raise exception 'Workspace access denied'; end if;
  if jsonb_typeof(p_settings->'print_packages')<>'array' or jsonb_array_length(p_settings->'print_packages')<1 or jsonb_array_length(p_settings->'print_packages')>12 then raise exception 'Configure between 1 and 12 print packages'; end if;
  if jsonb_typeof(p_settings->'print_sizes')<>'array' then raise exception 'Select available print sizes'; end if;
  if exists(select 1 from jsonb_array_elements(p_settings->'print_packages') p where coalesce(p->>'code','') !~ '^[a-z0-9_-]{1,24}$' or length(coalesce(p->>'label','')) not between 1 and 80 or coalesce((p->>'quantity')::integer,0)<1 or (p->>'quantity')::integer>100) then raise exception 'Invalid print package'; end if;
  if exists(select 1 from jsonb_array_elements(p_settings->'print_packages') p group by p->>'code' having count(*)>1) then raise exception 'Print package codes must be unique'; end if;
  if exists(select 1 from jsonb_array_elements(p_settings->'print_packages') p where (p->>'quantity')::integer>(p_settings->>'max_print_quantity')::integer) then raise exception 'A package exceeds the maximum print quantity'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_settings->'print_sizes') s where s not in ('2x6','4x6','4x4')) then raise exception 'Unsupported print size'; end if;
  if jsonb_array_length(p_settings->'print_sizes')=0 then raise exception 'Select at least one print size'; end if;
  if coalesce(array_length(p_template_ids,1),0)=0 then raise exception 'Enable at least one template for guest orders'; end if;
  if exists(select 1 from unnest(coalesce(p_template_ids,array[]::uuid[])) x where not exists(select 1 from public.templates t where t.id=x and t.is_active and (t.is_system or t.workspace_id=ws))) then raise exception 'One or more templates are not available in this workspace'; end if;
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
  delete from public.event_guest_templates where event_id=p_event_id and workspace_id=ws;
  foreach tid in array coalesce(p_template_ids,array[]::uuid[]) loop
    insert into public.event_guest_templates(workspace_id,event_id,template_id) values(ws,p_event_id,tid);
  end loop;
end; $$;

create or replace function public.get_public_guest_event(p_code text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'code',e.public_event_code,'name',e.name,'event_type',e.event_type,'event_date',e.event_date,
    'venue',e.venue,'primary_color',coalesce(e.primary_color,'#6658e8'),'secondary_color',coalesce(e.secondary_color,'#171b25'),
    'guest_instructions',s.guest_instructions,'print_sizes',s.print_sizes,'print_packages',s.print_packages,
    'max_photos_per_guest',s.max_photos_per_guest,'max_photo_size_bytes',s.max_photo_size_bytes,
    'min_photo_width',s.min_photo_width,'min_photo_height',s.min_photo_height,'max_photo_pixels',s.max_photo_pixels,
    'max_print_quantity',s.max_print_quantity,'marketing_consent_enabled',s.marketing_consent_enabled,
    'templates',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'description',t.description,'width_px',t.width_px,'height_px',t.height_px,'dpi',t.dpi,'layout_config',t.layout_config,'background',t.background) order by t.name)
      from public.event_guest_templates et join public.templates t on t.id=et.template_id
      where et.event_id=e.id and et.workspace_id=e.workspace_id and t.is_active and (t.is_system or t.workspace_id=e.workspace_id)),'[]'::jsonb)
  )
  from public.events e join public.event_guest_settings s on s.event_id=e.id and s.workspace_id=e.workspace_id
  where e.public_event_code=p_code and e.guest_portal_enabled and e.status='active'
$$;

create or replace function public.consume_guest_rate_limit(p_scope_hash text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  if p_scope_hash !~ '^[a-f0-9]{64}$' or p_limit<1 or p_limit>600 or p_window_seconds<1 or p_window_seconds>86400 then return false; end if;
  insert into public.guest_rate_limits(scope_hash,window_started_at,hit_count,updated_at) values(p_scope_hash,now(),1,now())
  on conflict(scope_hash) do update set
    hit_count=case when public.guest_rate_limits.window_started_at+make_interval(secs=>p_window_seconds)<=now() then 1 else public.guest_rate_limits.hit_count+1 end,
    window_started_at=case when public.guest_rate_limits.window_started_at+make_interval(secs=>p_window_seconds)<=now() then now() else public.guest_rate_limits.window_started_at end,
    updated_at=now()
  returning hit_count into n;
  return n<=p_limit;
end; $$;

create or replace function public.create_guest_session(p_code text,p_access_token_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.events%rowtype; s public.event_guest_settings%rowtype; sid uuid;
begin
  if p_access_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid guest token'; end if;
  select * into e from public.events where public_event_code=p_code and guest_portal_enabled and status='active';
  if not found then raise exception 'Guest portal is unavailable'; end if;
  select * into s from public.event_guest_settings where event_id=e.id;
  insert into public.guest_sessions(workspace_id,event_id,access_token_hash) values(e.workspace_id,e.id,p_access_token_hash) returning id into sid;
  return jsonb_build_object('guest_session_id',sid,'expires_at',now()+interval '7 days','max_photos_per_guest',s.max_photos_per_guest,'max_photo_size_bytes',s.max_photo_size_bytes);
end; $$;

create or replace function public.verify_guest_session(p_code text,p_access_token_hash text)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('guest_session_id',gs.id,'event_id',e.id,'workspace_id',e.workspace_id,
    'max_photos_per_guest',s.max_photos_per_guest,'max_photo_size_bytes',s.max_photo_size_bytes,
    'min_photo_width',s.min_photo_width,'min_photo_height',s.min_photo_height,'max_photo_pixels',s.max_photo_pixels,
    'max_print_quantity',s.max_print_quantity,'marketing_consent_enabled',s.marketing_consent_enabled,
    'photo_count',(select count(*) from public.guest_photos gp where gp.guest_session_id=gs.id))
  from public.guest_sessions gs join public.events e on e.id=gs.event_id
  join public.event_guest_settings s on s.event_id=e.id
  where e.public_event_code=p_code and e.guest_portal_enabled and e.status='active'
    and gs.access_token_hash=p_access_token_hash and gs.revoked_at is null and gs.expires_at>now()
$$;

create or replace function public.register_guest_photo(
  p_code text,p_access_token_hash text,p_object_path text,p_filename text,p_mime_type text,
  p_file_size bigint,p_width integer,p_height integer
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare auth_data jsonb; sid uuid; used integer; result public.guest_photos%rowtype;
begin
  auth_data:=public.verify_guest_session(p_code,p_access_token_hash);
  if auth_data is null then raise exception 'Guest session expired or unavailable'; end if;
  sid:=(auth_data->>'guest_session_id')::uuid;
  select id into sid from public.guest_sessions where id=sid for update;
  select count(*) into used from public.guest_photos where guest_session_id=sid;
  if used >= (auth_data->>'max_photos_per_guest')::integer then raise exception 'Photo limit reached'; end if;
  if p_mime_type not in ('image/jpeg','image/png','image/webp') or p_file_size<1 or p_file_size>(auth_data->>'max_photo_size_bytes')::bigint then raise exception 'Photo type or file size is not allowed'; end if;
  if p_object_path not like p_code||'/'||sid::text||'/%' then raise exception 'Invalid photo path'; end if;
  insert into public.guest_photos(workspace_id,event_id,guest_session_id,object_path,filename,mime_type,file_size,width_px,height_px)
  values((auth_data->>'workspace_id')::uuid,(auth_data->>'event_id')::uuid,sid,p_object_path,left(p_filename,255),p_mime_type,p_file_size,p_width,p_height)
  returning * into result;
  return jsonb_build_object('id',result.id,'filename',result.filename,'mime_type',result.mime_type,'file_size',result.file_size,'width_px',result.width_px,'height_px',result.height_px);
end; $$;

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
  select * into s from public.event_guest_settings where event_id=e.id;
  select tp.* into t from public.templates tp join public.event_guest_templates et on et.template_id=tp.id
    where et.event_id=e.id and et.workspace_id=e.workspace_id and tp.id=p_template_id and tp.is_active and (tp.is_system or tp.workspace_id=e.workspace_id);
  if not found then raise exception 'Template is not enabled for this event'; end if;
  if p_size<>all(s.print_sizes) then raise exception 'Print size is not available for this event'; end if;
  if p_quantity<1 or p_quantity>s.max_print_quantity then raise exception 'Print quantity is outside event limits'; end if;
  if not exists(select 1 from jsonb_array_elements(s.print_packages) pkg where pkg->>'code'=p_package_code and (pkg->>'quantity')::integer=p_quantity) then raise exception 'Print package is not available for this event'; end if;
  if s.marketing_consent_enabled and p_marketing_consent is null then raise exception 'Marketing consent choice is required'; end if;
  if jsonb_typeof(p_design)<>'object' or (p_design->>'version')::integer<>1 or jsonb_typeof(p_design->'elements')<>'array' or jsonb_array_length(p_design->'elements')>200 then raise exception 'Invalid design model'; end if;
  if (p_design#>>'{canvas,width}')::integer<>t.width_px or (p_design#>>'{canvas,height}')::integer<>t.height_px or (p_design#>>'{canvas,dpi}')::integer<>t.dpi then raise exception 'Design dimensions must match the selected template'; end if;
  for el in select value from jsonb_array_elements(p_design->'elements') loop
    if el->>'type' not in ('photo','text','shape') then raise exception 'Unsupported design element'; end if;
    if el->>'type'='photo' then
      if coalesce(el->>'photoId','')='' and coalesce((el->>'required')::boolean,true) then raise exception 'A required photo slot has no uploaded photo'; end if;
      if coalesce(el->>'photoId','')<>'' then
        if (el->>'photoId') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Invalid photo slot assignment'; end if;
        photo_id:=(el->>'photoId')::uuid;
        if not exists(select 1 from public.guest_photos gp where gp.id=photo_id and gp.guest_session_id=sid and gp.event_id=e.id) then raise exception 'Photo does not belong to this guest session'; end if;
      end if;
    end if;
  end loop;
  if p_final_export_path not like e.public_event_code||'/'||sid::text||'/%' then raise exception 'Invalid export path'; end if;
  insert into public.event_queue_counters(event_id,last_number) values(e.id,0) on conflict(event_id) do nothing;
  update public.event_queue_counters set last_number=last_number+1 where event_id=e.id returning last_number into seq;
  qno:=e.queue_prefix||'-'||lpad(seq::text,3,'0');
  ref:='SQ-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  job_status:=case when s.approval_mode='manual' then 'pending_approval' when s.queue_paused then 'submitted' else 'queued' end;
  insert into public.print_jobs(workspace_id,event_id,guest_session_id,queue_number,queue_position,order_reference,tracking_token_hash,selected_template_id,design_config,final_export_path,print_quantity,print_size,package_code,status,marketing_consent)
  values(e.workspace_id,e.id,sid,qno,seq,ref,p_tracking_token_hash,p_template_id,p_design,p_final_export_path,p_quantity,p_size,p_package_code,job_status,coalesce(p_marketing_consent,false));
  return jsonb_build_object('queue_number',qno,'order_reference',ref,'status',job_status,'template_name',t.name,'print_quantity',p_quantity,'print_size',p_size,'package_code',p_package_code);
end; $$;

create or replace function public.get_guest_order(p_tracking_token_hash text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('queue_number',j.queue_number,'order_reference',j.order_reference,'status',j.status,
    'template_name',t.name,'print_quantity',j.print_quantity,'print_size',j.print_size,'submitted_at',j.submitted_at,
    'queue_ahead',(select count(*) from public.print_jobs ahead where ahead.event_id=j.event_id and ahead.status in ('queued','printing')
      and (ahead.priority>j.priority or (ahead.priority=j.priority and ahead.queue_position<j.queue_position))))
  from public.print_jobs j join public.templates t on t.id=j.selected_template_id
  where j.tracking_token_hash=p_tracking_token_hash and j.tracking_token_hash is not null
$$;

create or replace function public.operate_print_queue(p_event_id uuid,p_job_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.print_jobs%rowtype; e public.events%rowtype; seq bigint; new_id uuid; next_status text;
begin
  if auth.uid() is null or not public.can_edit_workspace((select workspace_id from public.events where id=p_event_id)) then raise exception 'Workspace access denied'; end if;
  select * into e from public.events where id=p_event_id;
  if not found then raise exception 'Event not found'; end if;
  if p_action in ('pause','resume') then
    update public.event_guest_settings set queue_paused=(p_action='pause'),updated_at=now() where event_id=p_event_id;
    if p_action='resume' then
      update public.print_jobs set status='queued' where event_id=p_event_id and status='submitted';
    end if;
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
    insert into public.print_jobs(workspace_id,event_id,guest_session_id,queue_number,queue_position,order_reference,selected_template_id,design_config,final_export_path,print_quantity,print_size,package_code,status,priority)
    values(j.workspace_id,j.event_id,j.guest_session_id,e.queue_prefix||'-'||lpad(seq::text,3,'0'),seq,'SQ-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),j.selected_template_id,j.design_config,j.final_export_path,j.print_quantity,j.print_size,j.package_code,'queued',j.priority)
    returning id into new_id;
    return jsonb_build_object('job_id',new_id,'status','queued');
  else raise exception 'Action is not valid for job status %',j.status;
  end if;
  update public.print_jobs set status=next_status,attempt_count=case when p_action='retry' then attempt_count+1 else attempt_count end,
    failure_reason=case when p_action='retry' then null else failure_reason end,
    completed_at=case when next_status='completed' then now() else completed_at end
  where id=j.id returning * into j;
  return jsonb_build_object('job_id',j.id,'status',j.status,'queue_number',j.queue_number);
end; $$;


revoke all on function public.get_public_guest_event(text) from public;
revoke all on function public.consume_guest_rate_limit(text,integer,integer) from public;
revoke all on function public.create_guest_session(text,text) from public;
revoke all on function public.verify_guest_session(text,text) from public;
revoke all on function public.register_guest_photo(text,text,text,text,text,bigint,integer,integer) from public;
revoke all on function public.submit_guest_print_job(text,text,text,uuid,text,jsonb,text,integer,text,boolean) from public;
revoke all on function public.get_guest_order(text) from public;
revoke all on function public.operate_print_queue(uuid,uuid,text) from public;
revoke all on function public.save_event_guest_settings(uuid,jsonb,uuid[]) from public;
grant execute on function public.get_public_guest_event(text) to anon,authenticated;
grant execute on function public.consume_guest_rate_limit(text,integer,integer) to service_role;
grant execute on function public.create_guest_session(text,text) to service_role;
grant execute on function public.verify_guest_session(text,text) to service_role;
grant execute on function public.register_guest_photo(text,text,text,text,text,bigint,integer,integer) to service_role;
grant execute on function public.submit_guest_print_job(text,text,text,uuid,text,jsonb,text,integer,text,boolean) to service_role;
grant execute on function public.get_guest_order(text) to anon,authenticated;
grant execute on function public.operate_print_queue(uuid,uuid,text) to authenticated;
grant execute on function public.save_event_guest_settings(uuid,jsonb,uuid[]) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('snapqueue-guest-uploads','snapqueue-guest-uploads',false,20971520,array['image/jpeg','image/png','image/webp']),
      ('snapqueue-guest-exports','snapqueue-guest-exports',false,52428800,array['image/png','image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='print_jobs') then
    alter publication supabase_realtime add table public.print_jobs;
  end if;
end $$;
