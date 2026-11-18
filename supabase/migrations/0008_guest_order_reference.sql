-- Use PostgreSQL's built-in UUID generator for order references. The
-- security-definer function intentionally limits search_path, so pgcrypto's
-- gen_random_bytes may not be visible in every Supabase project.
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
  if exists(
    select 1 from jsonb_array_elements(p_design->'elements') guest_element
    where guest_element->>'type'='photo' and not exists(
      select 1 from jsonb_array_elements(coalesce(t.layout_config->'elements','[]'::jsonb)) template_element
      where template_element->>'type'='photo' and template_element->>'id'=guest_element->>'id'
        and template_element->>'x'=guest_element->>'x' and template_element->>'y'=guest_element->>'y'
        and template_element->>'width'=guest_element->>'width' and template_element->>'height'=guest_element->>'height'
        and coalesce(template_element->>'rotation','0')=coalesce(guest_element->>'rotation','0')
    )
  ) then raise exception 'Photo slots must match the selected template'; end if;
  if exists(
    select 1 from jsonb_array_elements(coalesce(t.layout_config->'elements','[]'::jsonb)) template_element
    where template_element->>'type'='photo'
      and coalesce((template_element->>'visible')::boolean,true)
      and coalesce((template_element->>'required')::boolean,coalesce((t.layout_config->>'photo_slots_required')::boolean,true))
      and not exists(
        select 1 from jsonb_array_elements(p_design->'elements') guest_element
        where guest_element->>'type'='photo' and guest_element->>'id'=template_element->>'id'
          and coalesce(guest_element->>'photoId','') ~ '^[0-9a-fA-F-]{36}$'
      )
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
  insert into public.print_jobs(workspace_id,event_id,guest_session_id,queue_number,queue_position,order_reference,tracking_token_hash,selected_template_id,design_config,final_export_path,print_quantity,print_size,package_code,status,marketing_consent)
  values(e.workspace_id,e.id,sid,qno,seq,ref,p_tracking_token_hash,p_template_id,p_design,p_final_export_path,p_quantity,p_size,p_package_code,job_status,coalesce(p_marketing_consent,false));
  return jsonb_build_object('queue_number',qno,'order_reference',ref,'status',job_status,'template_name',t.name,'print_quantity',p_quantity,'print_size',p_size,'package_code',p_package_code);
end; $$;

revoke all on function public.submit_guest_print_job(text,text,text,uuid,text,jsonb,text,integer,text,boolean) from public;
grant execute on function public.submit_guest_print_job(text,text,text,uuid,text,jsonb,text,integer,text,boolean) to service_role;
