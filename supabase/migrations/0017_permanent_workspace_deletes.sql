-- Allow deleting generated library files while retaining their print job history.
alter table public.print_jobs alter column final_export_path drop not null;

create or replace function public.delete_workspace_event(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  ws uuid;
  result jsonb;
begin
  select workspace_id into ws from public.events where id=p_event_id for update;
  if ws is null then raise exception 'Event not found'; end if;
  if auth.uid() is null or not public.can_edit_workspace(ws) then raise exception 'Workspace access denied'; end if;

  select jsonb_build_object(
    'uploads',coalesce((select jsonb_agg(distinct gp.object_path) from public.guest_photos gp where gp.event_id=p_event_id),'[]'::jsonb),
    'exports',coalesce((select jsonb_agg(distinct path) from (
      select j.final_export_path as path from public.print_jobs j where j.event_id=p_event_id and j.final_export_path is not null
      union select i.storage_path from public.printable_images i where i.event_id=p_event_id
    ) paths),'[]'::jsonb),
    'legacy_originals',coalesce((select jsonb_agg(distinct p.original_path) from public.photos p join public.photo_sessions s on s.id=p.session_id where s.event_id=p_event_id),'[]'::jsonb),
    'legacy_exports',coalesce((select jsonb_agg(distinct x.file_path) from public.session_exports x join public.photo_sessions s on s.id=x.session_id where s.event_id=p_event_id),'[]'::jsonb)
  ) into result;

  delete from public.print_attempts where event_id=p_event_id;
  update public.print_jobs set printable_image_id=null where event_id=p_event_id;
  delete from public.printable_images where event_id=p_event_id;
  delete from public.print_jobs where event_id=p_event_id;
  delete from public.photo_sessions where event_id=p_event_id;
  delete from public.events where id=p_event_id and workspace_id=ws;
  return result;
end; $$;
revoke all on function public.delete_workspace_event(uuid) from public,anon;
grant execute on function public.delete_workspace_event(uuid) to authenticated;

create or replace function public.delete_workspace_printable_image(p_image_id uuid)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare
  image_row public.printable_images%rowtype;
begin
  select * into image_row from public.printable_images where id=p_image_id for update;
  if not found then raise exception 'Printable image not found'; end if;
  if auth.uid() is null or not public.can_edit_workspace(image_row.workspace_id) then raise exception 'Workspace access denied'; end if;
  update public.print_jobs set printable_image_id=null,final_export_path=null where id=image_row.print_job_id and printable_image_id=image_row.id;
  delete from public.printable_images where id=image_row.id;
  return image_row.storage_path;
end; $$;
revoke all on function public.delete_workspace_printable_image(uuid) from public,anon;
grant execute on function public.delete_workspace_printable_image(uuid) to authenticated;

create or replace function public.delete_workspace_template(p_template_id uuid)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare
  template_row public.templates%rowtype;
  overlay_path text;
begin
  select * into template_row from public.templates where id=p_template_id for update;
  if not found then raise exception 'Template not found'; end if;
  if template_row.is_system or template_row.workspace_id is null then raise exception 'System templates cannot be deleted'; end if;
  if auth.uid() is null or not public.can_edit_workspace(template_row.workspace_id) then raise exception 'Workspace access denied'; end if;
  if exists(select 1 from public.event_layouts where template_id=p_template_id)
    or exists(select 1 from public.event_guest_settings where layout_template_id=p_template_id)
    or exists(select 1 from public.print_jobs where selected_template_id=p_template_id) then
    raise exception 'This template is used by an event or print job. Change those layouts before deleting it.';
  end if;
  overlay_path:=template_row.layout_config#>>'{overlay,path}';
  delete from public.templates where id=p_template_id and workspace_id=template_row.workspace_id and not is_system;
  return overlay_path;
end; $$;
revoke all on function public.delete_workspace_template(uuid) from public,anon;
grant execute on function public.delete_workspace_template(uuid) to authenticated;
