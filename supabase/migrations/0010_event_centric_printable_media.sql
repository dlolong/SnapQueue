-- Event-centric printable media model. Legacy photo_sessions/photos/exports are
-- retained for deployed data; the application no longer creates new sessions.

-- Some deployed print_jobs tables were created before package_code was added
-- to the original CREATE TABLE definition. The queue RPC requires this column.
alter table public.print_jobs add column if not exists package_code text;
update public.print_jobs set package_code='single' where package_code is null;
alter table public.print_jobs alter column package_code set default 'single';
alter table public.print_jobs alter column package_code set not null;

create table if not exists public.event_layouts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid not null unique references public.events(id) on delete cascade,
  template_id uuid not null references public.templates(id) on delete restrict,
  name text not null,
  version integer not null default 1 check(version > 0),
  layout_config jsonb not null check(jsonb_typeof(layout_config)='object'),
  width_px integer not null check(width_px > 0),
  height_px integer not null check(height_px > 0),
  dpi integer not null check(dpi between 72 and 1200),
  is_active boolean not null default true check(is_active),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.validate_event_layout_tenant()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare event_workspace uuid; template_workspace uuid; system_template boolean;
begin
  select workspace_id into event_workspace from public.events where id=new.event_id;
  select workspace_id,is_system into template_workspace,system_template from public.templates where id=new.template_id;
  if event_workspace is null or new.workspace_id is distinct from event_workspace then
    raise exception 'Event layout must belong to the event workspace';
  end if;
  if not found or (system_template is not true and template_workspace is distinct from event_workspace) then
    raise exception 'Event layout template must belong to this workspace';
  end if;
  return new;
end; $$;
drop trigger if exists validate_event_layout_tenant on public.event_layouts;
create trigger validate_event_layout_tenant before insert or update on public.event_layouts
for each row execute function public.validate_event_layout_tenant();

create or replace function public.sync_event_layout_from_guest_settings()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.layout_template_id is null or new.layout_config is null then return new; end if;
  insert into public.event_layouts(workspace_id,event_id,template_id,name,version,layout_config,width_px,height_px,dpi,is_active,updated_at)
  values(new.workspace_id,new.event_id,new.layout_template_id,coalesce(new.layout_name,'Event layout'),greatest(new.layout_version,1),new.layout_config,new.layout_width_px,new.layout_height_px,new.layout_dpi,true,now())
  on conflict(event_id) do update set
    workspace_id=excluded.workspace_id,template_id=excluded.template_id,name=excluded.name,
    version=excluded.version,layout_config=excluded.layout_config,width_px=excluded.width_px,
    height_px=excluded.height_px,dpi=excluded.dpi,is_active=true,updated_at=now();
  return new;
end; $$;
drop trigger if exists sync_event_layout_from_guest_settings on public.event_guest_settings;
create trigger sync_event_layout_from_guest_settings after insert or update of layout_template_id,layout_name,layout_config,layout_width_px,layout_height_px,layout_dpi,layout_version
on public.event_guest_settings for each row execute function public.sync_event_layout_from_guest_settings();

insert into public.event_layouts(workspace_id,event_id,template_id,name,version,layout_config,width_px,height_px,dpi,is_active)
select s.workspace_id,s.event_id,s.layout_template_id,coalesce(s.layout_name,'Event layout'),greatest(s.layout_version,1),s.layout_config,s.layout_width_px,s.layout_height_px,s.layout_dpi,true
from public.event_guest_settings s
where s.layout_template_id is not null and s.layout_config is not null and s.layout_width_px>0 and s.layout_height_px>0 and s.layout_dpi between 72 and 1200
on conflict(event_id) do update set workspace_id=excluded.workspace_id,template_id=excluded.template_id,name=excluded.name,
  version=excluded.version,layout_config=excluded.layout_config,width_px=excluded.width_px,height_px=excluded.height_px,dpi=excluded.dpi,is_active=true,updated_at=now();

alter table public.event_layouts enable row level security;
drop policy if exists "members read event layouts" on public.event_layouts;
create policy "members read event layouts" on public.event_layouts for select using(public.is_workspace_member(workspace_id));
grant select on public.event_layouts to authenticated;

create table if not exists public.temporary_uploads (
  id uuid primary key default gen_random_uuid(),
  guest_photo_id uuid not null unique references public.guest_photos(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  guest_session_id uuid not null references public.guest_sessions(id) on delete cascade,
  print_job_id uuid references public.print_jobs(id) on delete set null,
  object_path text not null unique,
  filename text not null,
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
  file_size bigint not null check(file_size>0),
  width_px integer not null check(width_px>0),
  height_px integer not null check(height_px>0),
  status text not null default 'uploaded' check(status in ('uploaded','attached_to_job')),
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.sync_temporary_upload_from_guest_photo()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' then delete from public.temporary_uploads where guest_photo_id=old.id; return old; end if;
  insert into public.temporary_uploads(guest_photo_id,workspace_id,event_id,guest_session_id,object_path,filename,mime_type,file_size,width_px,height_px,uploaded_at,updated_at)
  values(new.id,new.workspace_id,new.event_id,new.guest_session_id,new.object_path,new.filename,new.mime_type,new.file_size,new.width_px,new.height_px,new.created_at,now())
  on conflict(guest_photo_id) do update set workspace_id=excluded.workspace_id,event_id=excluded.event_id,guest_session_id=excluded.guest_session_id,
    object_path=excluded.object_path,filename=excluded.filename,mime_type=excluded.mime_type,file_size=excluded.file_size,
    width_px=excluded.width_px,height_px=excluded.height_px,updated_at=now();
  return new;
end; $$;
drop trigger if exists sync_temporary_upload_from_guest_photo on public.guest_photos;
create trigger sync_temporary_upload_from_guest_photo after insert or update or delete on public.guest_photos
for each row execute function public.sync_temporary_upload_from_guest_photo();

insert into public.temporary_uploads(guest_photo_id,workspace_id,event_id,guest_session_id,object_path,filename,mime_type,file_size,width_px,height_px,uploaded_at)
select id,workspace_id,event_id,guest_session_id,object_path,filename,mime_type,file_size,width_px,height_px,created_at from public.guest_photos
on conflict(guest_photo_id) do nothing;

create index if not exists idx_temporary_uploads_event_uploaded on public.temporary_uploads(event_id,uploaded_at desc);
create index if not exists idx_temporary_uploads_job_status on public.temporary_uploads(print_job_id,status);
alter table public.temporary_uploads enable row level security;
revoke all on public.temporary_uploads from anon,authenticated;
grant all on public.temporary_uploads to service_role;

create table if not exists public.printable_images (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  print_job_id uuid not null references public.print_jobs(id) on delete restrict,
  queue_number text not null,
  storage_path text not null unique,
  image_format text not null check(image_format in ('image/png','image/jpeg')),
  width_inches numeric(8,3) not null check(width_inches>0),
  height_inches numeric(8,3) not null check(height_inches>0),
  width_px integer not null check(width_px>0),
  height_px integer not null check(height_px>0),
  dpi integer not null check(dpi between 72 and 1200),
  file_size_bytes bigint check(file_size_bytes is null or file_size_bytes>0),
  print_quantity integer not null check(print_quantity between 1 and 100),
  export_version integer not null default 1 check(export_version>0),
  created_at timestamptz not null default now(),
  unique(print_job_id,export_version)
);

alter table public.print_jobs add column if not exists printable_image_id uuid;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.print_jobs'::regclass and conname='print_jobs_printable_image_id_fkey') then
    alter table public.print_jobs add constraint print_jobs_printable_image_id_fkey foreign key(printable_image_id) references public.printable_images(id) on delete restrict;
  end if;
end $$;
create index if not exists idx_printable_images_workspace_created on public.printable_images(workspace_id,created_at desc);
create index if not exists idx_printable_images_event_created on public.printable_images(event_id,created_at desc);
create index if not exists idx_printable_images_size on public.printable_images(workspace_id,width_inches,height_inches,created_at desc);
alter table public.printable_images enable row level security;
drop policy if exists "members read printable images" on public.printable_images;
create policy "members read printable images" on public.printable_images for select using(public.is_workspace_member(workspace_id));
grant select on public.printable_images to authenticated;
revoke insert,update,delete on public.printable_images from anon,authenticated;
grant all on public.printable_images to service_role;

-- Backfill the permanent library from completed guest compositions. Reprint
-- jobs reuse the original storage path, so uniqueness keeps one library row.
insert into public.printable_images(workspace_id,event_id,print_job_id,queue_number,storage_path,image_format,width_inches,height_inches,width_px,height_px,dpi,print_quantity,created_at)
select j.workspace_id,j.event_id,j.id,j.queue_number,j.final_export_path,
  case when lower(j.final_export_path) like '%.jpg' or lower(j.final_export_path) like '%.jpeg' then 'image/jpeg' else 'image/png' end,
  coalesce((j.layout_snapshot->>'width_px')::numeric/nullif((j.layout_snapshot->>'dpi')::numeric,0),t.width_px::numeric/nullif(t.dpi,0)),
  coalesce((j.layout_snapshot->>'height_px')::numeric/nullif((j.layout_snapshot->>'dpi')::numeric,0),t.height_px::numeric/nullif(t.dpi,0)),
  coalesce((j.layout_snapshot->>'width_px')::integer,t.width_px),coalesce((j.layout_snapshot->>'height_px')::integer,t.height_px),
  coalesce((j.layout_snapshot->>'dpi')::integer,t.dpi),j.print_quantity,j.submitted_at
from public.print_jobs j left join public.templates t on t.id=j.selected_template_id
where coalesce((j.layout_snapshot->>'width_px')::integer,t.width_px)>0 and coalesce((j.layout_snapshot->>'height_px')::integer,t.height_px)>0 and coalesce((j.layout_snapshot->>'dpi')::integer,t.dpi)>=72
on conflict(storage_path) do nothing;
update public.print_jobs j set printable_image_id=i.id from public.printable_images i where i.storage_path=j.final_export_path and j.printable_image_id is null;

create or replace function public.create_printable_image_for_job()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare image_id uuid; w integer; h integer; dpi_value integer;
begin
  select id into image_id from public.printable_images where storage_path=new.final_export_path;
  if image_id is null then
    select coalesce((new.layout_snapshot->>'width_px')::integer,t.width_px),coalesce((new.layout_snapshot->>'height_px')::integer,t.height_px),coalesce((new.layout_snapshot->>'dpi')::integer,t.dpi)
      into w,h,dpi_value from public.templates t where t.id=new.selected_template_id;
    if w is null or h is null or dpi_value is null or dpi_value<72 then raise exception 'Print job is missing valid output dimensions'; end if;
    insert into public.printable_images(workspace_id,event_id,print_job_id,queue_number,storage_path,image_format,width_inches,height_inches,width_px,height_px,dpi,print_quantity,created_at)
    values(new.workspace_id,new.event_id,new.id,new.queue_number,new.final_export_path,
      case when lower(new.final_export_path) like '%.jpg' or lower(new.final_export_path) like '%.jpeg' then 'image/jpeg' else 'image/png' end,
      w::numeric/dpi_value,h::numeric/dpi_value,w,h,dpi_value,new.print_quantity,new.submitted_at)
    on conflict(storage_path) do nothing returning id into image_id;
    if image_id is null then select id into image_id from public.printable_images where storage_path=new.final_export_path; end if;
  end if;
  update public.print_jobs set printable_image_id=image_id where id=new.id;
  update public.temporary_uploads tu set print_job_id=new.id,status='attached_to_job',updated_at=now()
  where tu.guest_session_id=new.guest_session_id and exists(
    select 1 from jsonb_array_elements(coalesce(new.design_config->'elements','[]'::jsonb)) element
    where element->>'type'='photo' and element->>'photoId'=tu.guest_photo_id::text
  );
  return new;
end; $$;
drop trigger if exists create_printable_image_for_job on public.print_jobs;
create trigger create_printable_image_for_job after insert on public.print_jobs
for each row when(new.final_export_path is not null) execute function public.create_printable_image_for_job();

-- Associate old source photos with the matching submitted job where possible.
update public.temporary_uploads tu set print_job_id=(
  select j.id from public.print_jobs j
  where j.guest_session_id=tu.guest_session_id
    and exists(select 1 from jsonb_array_elements(coalesce(j.design_config->'elements','[]'::jsonb)) e where e->>'photoId'=tu.guest_photo_id::text)
  order by j.submitted_at desc limit 1
),status='attached_to_job',updated_at=now()
where exists(select 1 from public.print_jobs j where j.guest_session_id=tu.guest_session_id
  and exists(select 1 from jsonb_array_elements(coalesce(j.design_config->'elements','[]'::jsonb)) e where e->>'photoId'=tu.guest_photo_id::text));

-- The guest portal reads the event's single active layout record. Guest-facing
-- event configuration still comes from event_guest_settings.
create or replace function public.get_public_guest_event(p_code text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'code',e.public_event_code,'name',e.name,'event_type',e.event_type,'event_date',e.event_date,
    'venue',e.venue,'primary_color',coalesce(e.primary_color,'#6658e8'),'secondary_color',coalesce(e.secondary_color,'#171b25'),
    'guest_instructions',s.guest_instructions,'print_sizes',s.print_sizes,'print_packages',s.print_packages,
    'max_photos_per_guest',s.max_photos_per_guest,'max_photo_size_bytes',s.max_photo_size_bytes,
    'max_print_quantity',s.max_print_quantity,'marketing_consent_enabled',s.marketing_consent_enabled,
    'layout',jsonb_build_object('template_id',l.template_id,'name',l.name,'width_px',l.width_px,
      'height_px',l.height_px,'dpi',l.dpi,'version',l.version,'layout_config',l.layout_config)
  )
  from public.events e
  join public.event_guest_settings s on s.event_id=e.id and s.workspace_id=e.workspace_id
  join public.event_layouts l on l.event_id=e.id and l.workspace_id=e.workspace_id and l.is_active
  where e.public_event_code=p_code and e.guest_portal_enabled and e.status='active'
$$;
revoke all on function public.get_public_guest_event(text) from public;
grant execute on function public.get_public_guest_event(text) to anon,authenticated;
