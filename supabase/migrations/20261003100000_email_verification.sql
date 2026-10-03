-- Email verification for new players. Login still uses username + password; the email is only verified and stored.
-- Existing players are left alone: needs_email defaults to false and is only set to true for new signups.
alter table public.profiles
  add column email text,
  add column email_verified_at timestamptz,
  add column needs_email boolean not null default false;

-- A verified address can belong to one player only.
create unique index profiles_email_verified_ci on public.profiles (lower(email)) where email_verified_at is not null;

-- Pending 6-digit codes. Only the server (service role) touches this table: RLS on, no policies, no grants.
create table public.email_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.email_codes enable row level security;
grant all on public.email_codes to service_role;

-- New signups must verify an email before playing.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare n text;
begin
  begin
    n := public.clean_display_name(new.raw_user_meta_data->>'display_name');
  exception when others then
    n := 'Player' || substr(replace(new.id::text,'-',''),1,6);
  end;
  delete from auth.users u using public.profiles p
    where p.id = u.id and u.is_anonymous and lower(p.display_name) = lower(n);
  if exists(select 1 from public.profiles where lower(display_name)=lower(n)) then
    n := left(n,15) || substr(replace(new.id::text,'-',''),1,4);
  end if;
  insert into public.profiles(id, display_name, needs_email) values (new.id, n, true);
  insert into public.user_roles(user_id, role) values (new.id, 'user');
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
