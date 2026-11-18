-- Run with `supabase test db` after applying all migrations in a local Supabase stack.
begin;
select plan(3);
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-a@snapqueue.test','',now(),now(),now()),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-b@snapqueue.test','',now(),now(),now());
insert into public.workspaces(id,name,created_by) values
 ('20000000-0000-4000-8000-000000000001','Tenant A','10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002','Tenant B','10000000-0000-4000-8000-000000000002');
insert into public.events(id,workspace_id,name,event_type,status) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','A event','Other','draft'),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','B event','Other','draft');
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
select is((select count(*)::int from public.events),1,'Tenant A reads its own event only');
select is(public.is_workspace_member('20000000-0000-4000-8000-000000000001'),true,'Tenant A membership is recognized');
select is(public.is_workspace_member('20000000-0000-4000-8000-000000000002'),false,'Tenant B membership is denied');
select * from finish();
rollback;
