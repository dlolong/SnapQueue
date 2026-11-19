-- Simplify operator queue states while preserving the legacy state for audit.
alter table public.print_jobs add column if not exists legacy_status text;
alter table public.print_jobs add column if not exists accepted_at timestamptz;
alter table public.print_jobs add column if not exists accepted_by uuid references auth.users(id) on delete set null;
alter table public.print_jobs add column if not exists printed_at timestamptz;
alter table public.print_jobs add column if not exists printed_by uuid references auth.users(id) on delete set null;
alter table public.print_jobs add column if not exists deleted_at timestamptz;
alter table public.print_jobs add column if not exists deleted_by uuid references auth.users(id) on delete set null;

alter table public.print_jobs drop constraint if exists print_jobs_status_check;
update public.print_jobs
set legacy_status=coalesce(legacy_status,status),
    status=case
      when status in ('submitted','pending_approval') then 'pending'
      when status in ('queued','printing','failed') then 'accepted'
      when status in ('ready_for_pickup','completed') then 'printed'
      when status in ('cancelled','rejected') then 'deleted'
      when status in ('pending','accepted','printed','deleted') then status
      else 'pending'
    end,
    accepted_at=case when status in ('queued','printing','failed','ready_for_pickup','completed') then coalesce(accepted_at,started_at,submitted_at) else accepted_at end,
    printed_at=case when status in ('ready_for_pickup','completed') then coalesce(printed_at,completed_at,started_at,submitted_at) else printed_at end,
    deleted_at=case when status in ('cancelled','rejected') then coalesce(deleted_at,completed_at,submitted_at) else deleted_at end;
alter table public.print_jobs add constraint print_jobs_status_check check(status in ('pending','accepted','printed','deleted'));

create table if not exists public.print_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  print_job_id uuid not null references public.print_jobs(id) on delete restrict,
  attempt_number integer not null check(attempt_number>0),
  attempt_type text not null check(attempt_type in ('print','reprint')),
  status text not null default 'initiated' check(status in ('initiated','confirmed')),
  initiated_by uuid references auth.users(id) on delete set null,
  initiated_at timestamptz not null default now(),
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  unique(print_job_id,attempt_number)
);
create index if not exists idx_print_attempts_job_created on public.print_attempts(print_job_id,initiated_at desc);
create index if not exists idx_print_attempts_workspace_created on public.print_attempts(workspace_id,initiated_at desc);
alter table public.print_attempts enable row level security;
drop policy if exists "members read print attempts" on public.print_attempts;
create policy "members read print attempts" on public.print_attempts for select using(public.is_workspace_member(workspace_id));
revoke all on public.print_attempts from anon,authenticated;
grant select on public.print_attempts to authenticated;
grant all on public.print_attempts to service_role;
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='print_attempts') then
    alter publication supabase_realtime add table public.print_attempts;
  end if;
end $$;

create or replace function public.set_new_guest_job_pending()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  new.status:='pending';
  return new;
end; $$;
drop trigger if exists set_new_guest_job_pending on public.print_jobs;
create trigger set_new_guest_job_pending before insert on public.print_jobs
for each row execute function public.set_new_guest_job_pending();

create or replace function public.operate_print_queue(p_event_id uuid,p_job_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  j public.print_jobs%rowtype;
  e public.events%rowtype;
  attempt_id uuid;
  attempt_no integer;
begin
  if auth.uid() is null or not public.can_edit_workspace((select workspace_id from public.events where id=p_event_id)) then
    raise exception 'Workspace access denied';
  end if;
  select * into e from public.events where id=p_event_id;
  if not found then raise exception 'Event not found'; end if;
  select * into j from public.print_jobs where id=p_job_id and event_id=p_event_id and workspace_id=e.workspace_id for update;
  if not found then raise exception 'Print job not found'; end if;

  if p_action='accept' and j.status='pending' then
    update public.print_jobs set status='accepted',accepted_at=now(),accepted_by=auth.uid()
    where id=j.id returning * into j;
    return jsonb_build_object('job_id',j.id,'status',j.status,'queue_number',j.queue_number);
  elsif p_action in ('print','reprint') then
    if p_action='print' and j.status<>'accepted' then
      raise exception 'Only accepted print jobs can be printed';
    elsif p_action='reprint' and j.status<>'printed' then
      raise exception 'Only printed jobs can be reprinted';
    end if;
    if j.final_export_path is null then raise exception 'Final printable image is unavailable'; end if;
    select coalesce(max(pa.attempt_number),0)+1 into attempt_no from public.print_attempts pa where pa.print_job_id=j.id;
    insert into public.print_attempts(workspace_id,event_id,print_job_id,attempt_number,attempt_type,initiated_by)
    values(j.workspace_id,j.event_id,j.id,attempt_no,p_action,auth.uid()) returning id into attempt_id;
    return jsonb_build_object('job_id',j.id,'attempt_id',attempt_id,'attempt_type',p_action,'status',j.status);
  elsif p_action='confirm_printed' and j.status='accepted' then
    select pa.id into attempt_id from public.print_attempts pa
      where pa.print_job_id=j.id and pa.attempt_type='print' and pa.status='initiated'
      order by pa.initiated_at desc limit 1 for update;
    if attempt_id is null then raise exception 'Start a print attempt before confirming the print'; end if;
    update public.print_attempts set status='confirmed',confirmed_by=auth.uid(),confirmed_at=now() where id=attempt_id;
    update public.print_jobs set status='printed',printed_at=now(),printed_by=auth.uid()
      where id=j.id returning * into j;
    return jsonb_build_object('job_id',j.id,'status',j.status,'queue_number',j.queue_number);
  elsif p_action='delete' and j.status in ('pending','accepted','printed') then
    update public.print_jobs set status='deleted',deleted_at=now(),deleted_by=auth.uid()
      where id=j.id returning * into j;
    return jsonb_build_object('job_id',j.id,'status',j.status,'queue_number',j.queue_number);
  end if;
  raise exception 'Action % is not valid for job status %',p_action,j.status;
end; $$;
revoke all on function public.operate_print_queue(uuid,uuid,text) from public;
grant execute on function public.operate_print_queue(uuid,uuid,text) to authenticated;

create or replace function public.get_guest_order(p_tracking_token_hash text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('queue_number',j.queue_number,'order_reference',j.order_reference,'status',j.status,
    'template_name',coalesce(j.layout_snapshot->>'name',t.name),'print_quantity',j.print_quantity,'print_size',j.print_size,'submitted_at',j.submitted_at,
    'queue_ahead',(select count(*) from public.print_jobs ahead where ahead.event_id=j.event_id and ahead.status in ('pending','accepted')
      and (ahead.priority>j.priority or (ahead.priority=j.priority and ahead.queue_position<j.queue_position))))
  from public.print_jobs j join public.templates t on t.id=j.selected_template_id
  where j.tracking_token_hash=p_tracking_token_hash and j.tracking_token_hash is not null and j.status<>'deleted'
$$;
revoke all on function public.get_guest_order(text) from public;
grant execute on function public.get_guest_order(text) to anon,authenticated;
