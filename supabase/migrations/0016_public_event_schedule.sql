create or replace function public.get_public_guest_event(p_code text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'code',e.public_event_code,'workspace_name',w.name,'workspace_logo_path',w.logo_path,
    'name',e.name,'event_type',e.event_type,'event_date',e.event_date,
    'start_time',e.start_time,'end_time',e.end_time,
    'venue',e.venue,'primary_color',coalesce(e.primary_color,'#6658e8'),'secondary_color',coalesce(e.secondary_color,'#171b25'),
    'guest_instructions',s.guest_instructions,'print_sizes',s.print_sizes,'print_packages',s.print_packages,
    'max_photos_per_guest',s.max_photos_per_guest,'max_photo_size_bytes',s.max_photo_size_bytes,
    'max_print_quantity',s.max_print_quantity,'marketing_consent_enabled',s.marketing_consent_enabled,
    'layout',jsonb_build_object('template_id',l.template_id,'name',l.name,'width_px',l.width_px,
      'height_px',l.height_px,'dpi',l.dpi,'version',l.version,'layout_config',l.layout_config)
  )
  from public.events e
  join public.workspaces w on w.id=e.workspace_id
  join public.event_guest_settings s on s.event_id=e.id and s.workspace_id=e.workspace_id
  join public.event_layouts l on l.event_id=e.id and l.workspace_id=e.workspace_id and l.is_active
  where e.public_event_code=p_code and e.guest_portal_enabled and e.status='active'
$$;
