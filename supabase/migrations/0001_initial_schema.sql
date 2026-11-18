-- SnapQueue Phase 1 starter schema.
-- Review and apply in a non-production Supabase project first.
create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','operator','viewer')),
  created_at timestamptz not null default now(),
  unique(workspace_id,user_id)
);
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  event_type text not null default 'Other',
  event_date date,
  start_time time,
  end_time time,
  venue text,
  client_name text,
  client_contact text,
  status text not null default 'draft' check(status in ('draft','active','completed','archived')),
  branding_logo_path text,
  branding_background_path text,
  primary_color text,
  secondary_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  category text not null default 'Custom',
  width_px integer not null check(width_px > 0),
  height_px integer not null check(height_px > 0),
  width_inches numeric(8,3),
  height_inches numeric(8,3),
  unit text not null default 'in',
  dpi integer not null default 300 check(dpi > 0),
  background jsonb not null default '{"type":"color","value":"#FFFFFF"}'::jsonb,
  layout_config jsonb not null default '{"version":1,"elements":[]}'::jsonb,
  thumbnail_path text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.photo_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  session_number text not null,
  session_type text not null default 'walk_in' check(session_type in ('event','walk_in')),
  customer_name text,
  customer_contact text,
  status text not null default 'draft' check(status in ('draft','editing','ready_for_export','exported','archived')),
  selected_template_id uuid references public.templates(id) on delete set null,
  design_config jsonb not null default '{"version":1,"canvas":{},"elements":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,session_number)
);
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  session_id uuid not null references public.photo_sessions(id) on delete cascade,
  original_path text not null,
  filename text not null,
  mime_type text not null,
  file_size bigint not null check(file_size >= 0),
  width_px integer,
  height_px integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.session_exports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  session_id uuid not null references public.photo_sessions(id) on delete cascade,
  file_path text not null,
  format text not null check(format in ('png','jpeg')),
  width_px integer not null,
  height_px integer not null,
  dpi integer not null default 300,
  file_size bigint,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  unique(session_id,version)
);

create index if not exists idx_events_workspace_date on public.events(workspace_id,event_date desc);
create index if not exists idx_sessions_workspace_created on public.photo_sessions(workspace_id,created_at desc);
create index if not exists idx_photos_session_sort on public.photos(session_id,sort_order);
create index if not exists idx_templates_workspace on public.templates(workspace_id,is_active);

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.workspace_members wm where wm.workspace_id=target_workspace and wm.user_id=auth.uid()); $$;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.events enable row level security;
alter table public.templates enable row level security;
alter table public.photo_sessions enable row level security;
alter table public.photos enable row level security;
alter table public.session_exports enable row level security;

create policy "members can read workspaces" on public.workspaces for select using (public.is_workspace_member(id));
create policy "authenticated users can create workspace" on public.workspaces for insert with check (auth.uid()=created_by);
create policy "members can update workspace" on public.workspaces for update using (public.is_workspace_member(id)) with check (public.is_workspace_member(id));

create policy "members can read memberships" on public.workspace_members for select using (public.is_workspace_member(workspace_id));
create policy "workspace creator can add initial membership" on public.workspace_members for insert with check (
  user_id=auth.uid() and exists(select 1 from public.workspaces w where w.id=workspace_id and w.created_by=auth.uid())
);

create policy "members manage events" on public.events for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "read system or workspace templates" on public.templates for select using (is_system or (workspace_id is not null and public.is_workspace_member(workspace_id)));
create policy "members manage own templates" on public.templates for all using (workspace_id is not null and public.is_workspace_member(workspace_id)) with check (workspace_id is not null and public.is_workspace_member(workspace_id));
create policy "members manage sessions" on public.photo_sessions for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members manage photos" on public.photos for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members manage exports" on public.session_exports for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

-- Storage buckets should be created as private buckets: snapqueue-originals and snapqueue-exports.
-- Add storage.objects policies after creating buckets; scope object names as:
-- {workspace_id}/{session_id}/original/{filename}
-- {workspace_id}/{session_id}/exports/{filename}
