-- The active event layout defines how many guest photos can be uploaded.
-- Keep the legacy column synchronized because the guest registration RPC uses it.
with counts as (
  select s.event_id, least(20, count(*)::integer) as photo_slots
  from public.event_guest_settings s
  cross join lateral jsonb_array_elements(coalesce(s.layout_config->'elements', '[]'::jsonb)) as element(value)
  where s.layout_config is not null and element.value->>'type' = 'photo'
  group by s.event_id
)
update public.event_guest_settings s
set
  max_photos_per_guest = counts.photo_slots,
  max_photo_size_bytes = 20971520,
  layout_config = s.layout_config || jsonb_build_object(
    'guest',
    coalesce(s.layout_config->'guest', '{}'::jsonb) || jsonb_build_object('maxPhotosPerGuest', counts.photo_slots)
  )
from counts
where s.event_id = counts.event_id;

alter table public.event_guest_settings
  alter column max_photo_size_bytes set default 20971520;

update public.event_guest_settings
set max_photo_size_bytes = 20971520;

create or replace function public.sync_event_guest_upload_limits()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare slot_count integer;
begin
  new.max_photo_size_bytes := 20971520;
  if new.layout_config is not null then
    select count(*)::integer into slot_count
    from jsonb_array_elements(coalesce(new.layout_config->'elements', '[]'::jsonb)) as element(value)
    where element.value->>'type' = 'photo';
    if slot_count < 1 or slot_count > 20 then
      raise exception 'Event layout must contain between 1 and 20 photo placeholders';
    end if;
    new.max_photos_per_guest := slot_count;
    new.layout_config := new.layout_config || jsonb_build_object(
      'guest', coalesce(new.layout_config->'guest', '{}'::jsonb) || jsonb_build_object('maxPhotosPerGuest', slot_count)
    );
  end if;
  return new;
end; $$;

drop trigger if exists sync_event_guest_upload_limits on public.event_guest_settings;
create trigger sync_event_guest_upload_limits
before insert or update on public.event_guest_settings
for each row execute function public.sync_event_guest_upload_limits();
