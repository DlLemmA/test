-- Invite-safe membership: workspace access is granted when GoTrue creates the
-- user, so auth.users never has to be seeded by hand (manual rows collide with
-- POST /invite and POST /otp on auth.users_email_partial_key).

create table if not exists public.workspace_invites (
  email text primary key
);

alter table public.workspace_invites enable row level security;

create policy "no direct client access" on public.workspace_invites
for all to anon, authenticated
using (false)
with check (false);

insert into public.workspace_invites (email)
values ('nikitakuzn2@gmail.com'), ('marinavik32@gmail.com')
on conflict (email) do nothing;

create or replace function public.grant_workspace_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.workspace_invites
    where email = lower(new.email)
  ) then
    insert into public.workspace_members (user_id, email)
    values (new.id, lower(new.email))
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.grant_workspace_membership();

-- The trigger runs as the function owner; nobody needs to call it over RPC.
revoke all on function public.grant_workspace_membership() from public, anon, authenticated;
