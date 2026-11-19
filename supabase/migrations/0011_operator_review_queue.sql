-- Every guest order enters operator review. There is no automatic print path.
-- Repair schemas where an earlier partial print_jobs table omitted package_code.
alter table public.print_jobs add column if not exists package_code text;
update public.print_jobs set package_code='single' where package_code is null;
alter table public.print_jobs alter column package_code set default 'single';
alter table public.print_jobs alter column package_code set not null;

alter table public.event_guest_settings alter column approval_mode set default 'manual';
update public.event_guest_settings set approval_mode='manual' where approval_mode is distinct from 'manual';

create or replace function public.force_manual_guest_order_review()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  new.approval_mode:='manual';
  return new;
end; $$;
drop trigger if exists force_manual_guest_order_review on public.event_guest_settings;
create trigger force_manual_guest_order_review
before insert or update on public.event_guest_settings
for each row execute function public.force_manual_guest_order_review();
