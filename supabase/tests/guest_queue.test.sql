-- Run with `supabase test db` after migrations 0001-0007 and template seeds.
begin;
select plan(7);
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('10000000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','guest-queue@snapqueue.test','',now(),now(),now());
insert into public.workspaces(id,name,created_by) values('20000000-0000-4000-8000-000000000011','Guest queue test','10000000-0000-4000-8000-000000000011');
insert into public.events(id,workspace_id,name,event_type,status,guest_portal_enabled,queue_prefix)
values('30000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000011','Queue test','Other','active',true,'Q');
insert into public.guest_sessions(id,workspace_id,event_id,access_token_hash)
values('40000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011',repeat('1',64));
insert into public.guest_photos(id,workspace_id,event_id,guest_session_id,object_path,filename,mime_type,file_size,width_px,height_px)
values('50000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011','40000000-0000-4000-8000-000000000011','test-code/40000000-0000-4000-8000-000000000011/p.jpg','p.jpg','image/jpeg',100,600,1800);
create temporary table guest_queue_results(queue_number text,order_reference text,job_status text);
create temporary table guest_codes(old_code text,new_code text);
do $$
declare t uuid; code text; design jsonb; first_order jsonb; second_order jsonb;
begin
  select id into t from public.templates where is_system and is_active and width_px=600 and height_px=1800 limit 1;
  if t is null then raise exception 'System 2x6 template seed is missing'; end if;
  code:=(select public_event_code from public.events where id='30000000-0000-4000-8000-000000000011');
  insert into guest_codes values(code,encode(gen_random_bytes(24),'hex'));
  update public.events set public_event_code=(select new_code from guest_codes),guest_portal_enabled=false where id='30000000-0000-4000-8000-000000000011';
  code:=(select public_event_code from public.events where id='30000000-0000-4000-8000-000000000011');
  update public.events set guest_portal_enabled=true where id='30000000-0000-4000-8000-000000000011';
  delete from public.event_guest_templates where event_id='30000000-0000-4000-8000-000000000011';
  insert into public.event_guest_templates(workspace_id,event_id,template_id) values('20000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011',t) on conflict do nothing;
  select jsonb_build_object('version',1,
      'canvas',jsonb_build_object('width',tp.width_px,'height',tp.height_px,'dpi',tp.dpi,'background',coalesce(tp.layout_config#>>'{canvas,background}','#ffffff')),
      'elements',jsonb_agg(case when el->>'type'='photo'
        then el||jsonb_build_object('photoId','50000000-0000-4000-8000-000000000011','visible',true,'locked',false,
          'required',coalesce((el->>'required')::boolean,coalesce((tp.layout_config->>'photo_slots_required')::boolean,true)),
          'fit',coalesce(el->>'fit',el#>>'{configuration,fit}','cover'))
        else el||jsonb_build_object('visible',true,'locked',false) end order by el->>'id'))
    into design
    from public.templates tp cross join lateral jsonb_array_elements(tp.layout_config->'elements') el
    where tp.id=t;
  first_order:=public.submit_guest_print_job(code,repeat('1',64),repeat('a',64),t,'single',design,code||'/40000000-0000-4000-8000-000000000011/exports/a.png',1,'2x6',false);
  second_order:=public.submit_guest_print_job(code,repeat('1',64),repeat('b',64),t,'single',design,code||'/40000000-0000-4000-8000-000000000011/exports/b.png',1,'2x6',false);
  insert into guest_queue_results values(first_order->>'queue_number',first_order->>'order_reference',first_order->>'status'),(second_order->>'queue_number',second_order->>'order_reference',second_order->>'status');
end $$;
select matches((select new_code from guest_codes),'^[a-f0-9]{48}$','Event access code is cryptographically random hex and does not encode its internal UUID');
select is(public.get_public_guest_event((select old_code from guest_codes)),null::jsonb,'Rotating an event code revokes the old guest URL');
select ok((public.get_public_guest_event((select new_code from guest_codes))->>'code')=(select new_code from guest_codes) and not (public.get_public_guest_event((select new_code from guest_codes)) ? 'id'),'Public event lookup returns safe guest details without the internal event ID');
select is((select count(distinct queue_number)::int from guest_queue_results),2,'Atomic event counter creates distinct queue numbers');
select is((select count(distinct order_reference)::int from guest_queue_results),2,'Each guest order receives a unique public reference');
select is((select count(*)::int from public.print_jobs where event_id='30000000-0000-4000-8000-000000000011' and status='queued'),2,'Automatic approval persists queued jobs');
select is((public.get_guest_order(repeat('b',64))->>'queue_ahead')::int,1,'Guest tracking returns the reliable number of jobs ahead');
select * from finish();
rollback;
