-- Share links: a player shares one day's picks; anyone with the link can view them, no account needed.
create table if not exists public.shares (
  id text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  user_id uuid not null references auth.users(id) on delete cascade,
  play_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, play_date)
);
alter table public.shares enable row level security;
grant all on public.shares to service_role;

-- Returns the share id for the caller's picks on _date, creating it on first use.
create or replace function public.create_share(_date date)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); sid text;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if not exists(select 1 from answers a join questions q on q.id = a.question_id where a.user_id = uid and q.play_date = _date) then
    raise exception 'Lock in your picks first';
  end if;
  insert into shares(user_id, play_date) values (uid, _date)
    on conflict (user_id, play_date) do update set user_id = excluded.user_id
    returning id into sid;
  return sid;
end $$;
revoke all on function public.create_share(date) from public, anon;
grant execute on function public.create_share(date) to authenticated;

-- Public view of a shared day: player name, streak and their picks. Null when the id doesn't exist.
create or replace function public.get_share(_id text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', p.display_name,
    'streak', p.current_streak,
    'play_date', s.play_date,
    'picks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'order_index', q.order_index, 'text', q.text, 'type', q.type,
        'option_a_label', q.option_a_label, 'option_b_label', q.option_b_label, 'options', q.options,
        'status', q.status, 'outcome', q.outcome, 'choice', a.choice, 'is_correct', a.is_correct
      ) order by q.order_index)
      from answers a join questions q on q.id = a.question_id
      where a.user_id = s.user_id and q.play_date = s.play_date
    ), '[]'::jsonb)
  )
  from shares s join profiles p on p.id = s.user_id
  where s.id = _id
$$;
revoke all on function public.get_share(text) from public;
grant execute on function public.get_share(text) to anon, authenticated;
