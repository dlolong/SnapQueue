-- Supabase migrations created these tables as postgres, so explicitly grant the
-- API roles SQL privileges. RLS remains enabled and is still the tenant boundary.
do $$ begin
  if to_regclass('public.workspace_session_counters') is null
     or to_regprocedure('public.can_edit_workspace(uuid)') is null
     or to_regprocedure('public.create_photo_session(uuid,uuid,text,text,text)') is null then
    raise exception 'Apply supabase/migrations/0003_phase_1_security.sql before 0004_authenticated_table_grants.sql';
  end if;
end $$;

grant usage on schema public to authenticated;

grant select, insert, update, delete on table
  public.workspaces,
  public.workspace_members,
  public.events,
  public.templates,
  public.photo_sessions,
  public.photos,
  public.session_exports
to authenticated;

-- Session counters are accessible only through the SECURITY DEFINER RPC.
revoke all on table public.workspace_session_counters from anon, authenticated;

grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_owner(uuid) to authenticated;
grant execute on function public.can_edit_workspace(uuid) to authenticated;
grant execute on function public.create_photo_session(uuid,uuid,text,text,text) to authenticated;
