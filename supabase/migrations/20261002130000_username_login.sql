-- Username + password login: the sign-in screen asks whether a name is free before anyone is signed in.
-- Returns 'free', or 'taken' when a password account already owns the name.
create or replace function public.username_status(_name text)
returns text language sql stable security definer set search_path = public, auth as $$
  select case when exists(
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where lower(p.display_name) = lower(btrim(regexp_replace(coalesce(_name, ''), '\s+', ' ', 'g')))
      and not coalesce(u.is_anonymous, false)
  ) then 'taken' else 'free' end
$$;
revoke all on function public.username_status(text) from public;
grant execute on function public.username_status(text) to anon, authenticated;

-- Names held by old guest (anonymous) accounts are released so a password account can claim them.
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
  insert into public.profiles(id, display_name) values (new.id, n);
  insert into public.user_roles(user_id, role) values (new.id, 'user');
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
