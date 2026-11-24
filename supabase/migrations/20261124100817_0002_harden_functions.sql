-- Follow-up to 0001: remove SECURITY DEFINER where it isn't needed and pin
-- the trigger function's search_path, as flagged by the Supabase linter.

-- The helper only reads workspace_members, whose own RLS policy already limits
-- rows to auth.uid(). SECURITY INVOKER is enough and avoids an RPC-callable
-- definer function.
create or replace function public.is_workspace_member()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members where user_id = auth.uid()
  );
$$;

revoke all on function public.is_workspace_member() from public;
revoke all on function public.is_workspace_member() from anon;
grant execute on function public.is_workspace_member() to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
