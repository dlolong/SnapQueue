-- Tighten tenant boundaries and add the private media buckets used by Phase 1.
create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.workspace_members wm where wm.workspace_id = target_workspace and wm.user_id = auth.uid()); $$;
revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
create or replace function public.can_edit_workspace(target_workspace uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp
as $$ select exists(select 1 from public.workspace_members wm where wm.workspace_id=target_workspace and wm.user_id=auth.uid() and wm.role in ('owner','admin','operator')); $$;
revoke all on function public.can_edit_workspace(uuid) from public;
grant execute on function public.can_edit_workspace(uuid) to authenticated;

-- Create the owner membership atomically with workspace creation. Clients cannot
-- add members to existing workspaces through the public API.
create or replace function public.add_workspace_creator_membership()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$ begin
  insert into public.workspace_members(workspace_id,user_id,role) values(new.id,new.created_by,'owner');
  return new;
end; $$;
drop trigger if exists workspace_creator_membership on public.workspaces;
create trigger workspace_creator_membership after insert on public.workspaces
for each row execute function public.add_workspace_creator_membership();
drop policy if exists "workspace creator can add initial membership" on public.workspace_members;
create or replace function public.is_workspace_owner(target_workspace uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp
as $$ select exists(select 1 from public.workspace_members wm where wm.workspace_id=target_workspace and wm.user_id=auth.uid() and wm.role='owner'); $$;
revoke all on function public.is_workspace_owner(uuid) from public;
grant execute on function public.is_workspace_owner(uuid) to authenticated;
drop policy if exists "owners can manage memberships" on public.workspace_members;
create policy "owners can manage memberships" on public.workspace_members for all
using (public.is_workspace_owner(workspace_id)) with check (public.is_workspace_owner(workspace_id));

drop policy if exists "members can update workspace" on public.workspaces;
drop policy if exists "admins can update workspace" on public.workspaces;
create policy "admins can update workspace" on public.workspaces for update
using (public.is_workspace_owner(id) or exists(select 1 from public.workspace_members wm where wm.workspace_id=id and wm.user_id=auth.uid() and wm.role='admin'))
with check (public.is_workspace_owner(id) or exists(select 1 from public.workspace_members wm where wm.workspace_id=id and wm.user_id=auth.uid() and wm.role='admin'));
drop policy if exists "members manage events" on public.events;
drop policy if exists "members read events" on public.events;
drop policy if exists "operators insert events" on public.events;
drop policy if exists "operators update events" on public.events;
drop policy if exists "operators delete events" on public.events;
create policy "members read events" on public.events for select using (public.is_workspace_member(workspace_id));
create policy "operators insert events" on public.events for insert with check (public.can_edit_workspace(workspace_id));
create policy "operators update events" on public.events for update using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
create policy "operators delete events" on public.events for delete using (public.can_edit_workspace(workspace_id));
drop policy if exists "members manage own templates" on public.templates;
drop policy if exists "members read own templates" on public.templates;
drop policy if exists "operators insert own templates" on public.templates;
drop policy if exists "operators update own templates" on public.templates;
drop policy if exists "operators delete own templates" on public.templates;
create policy "members read own templates" on public.templates for select using (workspace_id is not null and public.is_workspace_member(workspace_id));
create policy "operators insert own templates" on public.templates for insert with check (workspace_id is not null and public.can_edit_workspace(workspace_id));
create policy "operators update own templates" on public.templates for update using (workspace_id is not null and public.can_edit_workspace(workspace_id)) with check (workspace_id is not null and public.can_edit_workspace(workspace_id) and not is_system);
create policy "operators delete own templates" on public.templates for delete using (workspace_id is not null and public.can_edit_workspace(workspace_id) and not is_system);
drop policy if exists "members manage sessions" on public.photo_sessions;
drop policy if exists "members read sessions" on public.photo_sessions;
drop policy if exists "operators insert sessions" on public.photo_sessions;
drop policy if exists "operators update sessions" on public.photo_sessions;
drop policy if exists "operators delete sessions" on public.photo_sessions;
create policy "members read sessions" on public.photo_sessions for select using (public.is_workspace_member(workspace_id));
create policy "operators insert sessions" on public.photo_sessions for insert with check (public.can_edit_workspace(workspace_id));
create policy "operators update sessions" on public.photo_sessions for update using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
create policy "operators delete sessions" on public.photo_sessions for delete using (public.can_edit_workspace(workspace_id));
drop policy if exists "members manage photos" on public.photos;
drop policy if exists "members read photos" on public.photos;
drop policy if exists "operators insert photos" on public.photos;
drop policy if exists "operators update photos" on public.photos;
drop policy if exists "operators delete photos" on public.photos;
create policy "members read photos" on public.photos for select using (public.is_workspace_member(workspace_id));
create policy "operators insert photos" on public.photos for insert with check (public.can_edit_workspace(workspace_id));
create policy "operators update photos" on public.photos for update using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
create policy "operators delete photos" on public.photos for delete using (public.can_edit_workspace(workspace_id));
drop policy if exists "members manage exports" on public.session_exports;
drop policy if exists "members read exports" on public.session_exports;
drop policy if exists "operators insert exports" on public.session_exports;
drop policy if exists "operators update exports" on public.session_exports;
drop policy if exists "operators delete exports" on public.session_exports;
create policy "members read exports" on public.session_exports for select using (public.is_workspace_member(workspace_id));
create policy "operators insert exports" on public.session_exports for insert with check (public.can_edit_workspace(workspace_id));
create policy "operators update exports" on public.session_exports for update using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
create policy "operators delete exports" on public.session_exports for delete using (public.can_edit_workspace(workspace_id));

-- Workspace checks prevent linking a session to another tenant's event/template.
create or replace function public.validate_session_tenant_refs()
returns trigger language plpgsql set search_path = public, pg_temp as $$ begin
  if new.event_id is not null and not exists(select 1 from public.events e where e.id=new.event_id and e.workspace_id=new.workspace_id) then
    raise exception 'Event must belong to the session workspace';
  end if;
  if new.selected_template_id is not null and not exists(select 1 from public.templates t where t.id=new.selected_template_id and (t.is_system or t.workspace_id=new.workspace_id)) then
    raise exception 'Template must be a system template or belong to the session workspace';
  end if;
  return new;
end; $$;
drop trigger if exists validate_session_tenant_refs on public.photo_sessions;
create trigger validate_session_tenant_refs before insert or update on public.photo_sessions
for each row execute function public.validate_session_tenant_refs();

create or replace function public.validate_photo_tenant()
returns trigger language plpgsql set search_path = public, pg_temp as $$ begin
  if not exists(select 1 from public.photo_sessions s where s.id=new.session_id and s.workspace_id=new.workspace_id) then
    raise exception 'Photo session must belong to the photo workspace';
  end if;
  return new;
end; $$;
drop trigger if exists validate_photo_tenant on public.photos;
create trigger validate_photo_tenant before insert or update on public.photos
for each row execute function public.validate_photo_tenant();
create or replace function public.validate_export_tenant()
returns trigger language plpgsql set search_path = public, pg_temp as $$ begin
  if not exists(select 1 from public.photo_sessions s where s.id=new.session_id and s.workspace_id=new.workspace_id) then
    raise exception 'Export session must belong to the export workspace';
  end if;
  return new;
end; $$;
drop trigger if exists validate_export_tenant on public.session_exports;
create trigger validate_export_tenant before insert or update on public.session_exports
for each row execute function public.validate_export_tenant();

create index if not exists idx_events_workspace_status on public.events(workspace_id,status,event_date desc);
create index if not exists idx_sessions_event on public.photo_sessions(workspace_id,event_id,created_at desc);
create index if not exists idx_photos_workspace_created on public.photos(workspace_id,created_at desc);
create index if not exists idx_exports_session_version on public.session_exports(session_id,version desc);

create table if not exists public.workspace_session_counters (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  last_number bigint not null default 0
);
alter table public.workspace_session_counters enable row level security;
create or replace function public.create_photo_session(p_workspace_id uuid,p_event_id uuid,p_session_type text,p_customer_name text,p_customer_contact text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare next_number bigint; new_id uuid;
begin
  if auth.uid() is null or not public.can_edit_workspace(p_workspace_id) then raise exception 'Workspace access denied'; end if;
  if p_session_type not in ('event','walk_in') then raise exception 'Invalid session type'; end if;
  insert into public.workspace_session_counters(workspace_id,last_number) values(p_workspace_id,0) on conflict(workspace_id) do nothing;
  update public.workspace_session_counters set last_number=last_number+1 where workspace_id=p_workspace_id returning last_number into next_number;
  insert into public.photo_sessions(workspace_id,event_id,session_type,session_number,customer_name,customer_contact)
    values(p_workspace_id,p_event_id,p_session_type,to_char(now(),'YYMMDD')||'-'||lpad(next_number::text,5,'0'),nullif(p_customer_name,''),nullif(p_customer_contact,'')) returning id into new_id;
  return new_id;
end; $$;
revoke all on function public.create_photo_session(uuid,uuid,text,text,text) from public;
grant execute on function public.create_photo_session(uuid,uuid,text,text,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('snapqueue-originals','snapqueue-originals',false,20971520,array['image/jpeg','image/png','image/webp']),
       ('snapqueue-exports','snapqueue-exports',false,52428800,array['image/png','image/jpeg'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "workspace originals select" on storage.objects;
create policy "workspace originals select" on storage.objects for select to authenticated
using (bucket_id='snapqueue-originals' and public.is_workspace_member((storage.foldername(name))[1]::uuid));
drop policy if exists "workspace originals insert" on storage.objects;
create policy "workspace originals insert" on storage.objects for insert to authenticated
with check (bucket_id='snapqueue-originals' and public.can_edit_workspace((storage.foldername(name))[1]::uuid));
drop policy if exists "workspace originals delete" on storage.objects;
create policy "workspace originals delete" on storage.objects for delete to authenticated
using (bucket_id='snapqueue-originals' and public.can_edit_workspace((storage.foldername(name))[1]::uuid));
drop policy if exists "workspace exports select" on storage.objects;
create policy "workspace exports select" on storage.objects for select to authenticated
using (bucket_id='snapqueue-exports' and public.is_workspace_member((storage.foldername(name))[1]::uuid));
drop policy if exists "workspace exports insert" on storage.objects;
create policy "workspace exports insert" on storage.objects for insert to authenticated
with check (bucket_id='snapqueue-exports' and public.can_edit_workspace((storage.foldername(name))[1]::uuid));
drop policy if exists "workspace exports delete" on storage.objects;
create policy "workspace exports delete" on storage.objects for delete to authenticated
using (bucket_id='snapqueue-exports' and public.can_edit_workspace((storage.foldername(name))[1]::uuid));
