-- The game day now starts at 08:00 Germany time (Europe/Berlin, summer/winter time handled)
-- instead of midnight UTC. Before 08:00 it is still "yesterday's" game day.
create or replace function public.game_today()
returns date language sql stable set search_path = public as $$
  select ((now() at time zone 'Europe/Berlin') - interval '8 hours')::date
$$;
grant execute on function public.game_today() to anon, authenticated;

-- Players only see questions whose game day has started.
drop policy if exists "players read published" on public.questions;
create policy "players read published" on public.questions for select to authenticated
  using (status <> 'draft' and play_date <= public.game_today());

-- Same as before, but "today" is the game day.
create or replace function public.submit_answers(_answers jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  today date := public.game_today();
  live_count int; given int; ok int;
  p public.profiles;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if jsonb_typeof(_answers) <> 'array' then raise exception 'Bad input'; end if;
  select count(*) into live_count from questions where play_date=today and status='live';
  if live_count = 0 then raise exception 'No questions today'; end if;
  given := jsonb_array_length(_answers);
  select count(distinct q.id) into ok
  from jsonb_array_elements(_answers) a
  join questions q on q.id = (a->>'question_id')::uuid
  where q.play_date=today and q.status='live' and public.valid_choice(q.type, q.options, a->>'choice');
  if ok <> live_count or given <> live_count then raise exception 'Answer every question once'; end if;
  if exists(select 1 from answers an join questions q on q.id=an.question_id where an.user_id=uid and q.play_date=today) then
    raise exception 'Already locked in today';
  end if;
  insert into answers(user_id, question_id, choice)
  select uid, (a->>'question_id')::uuid, a->>'choice' from jsonb_array_elements(_answers) a;

  select * into p from profiles where id=uid for update;
  if p.last_played_date = today then null;
  elsif p.last_played_date = today - 1 then
    update profiles set current_streak=current_streak+1, longest_streak=greatest(longest_streak,current_streak+1), last_played_date=today where id=uid;
  else
    update profiles set current_streak=1, longest_streak=greatest(longest_streak,1), last_played_date=today where id=uid;
  end if;
end $$;
revoke all on function public.submit_answers(jsonb) from public, anon;
grant execute on function public.submit_answers(jsonb) to authenticated;

-- Same as before, but the weekly table starts on the Monday of the current game day's week.
create or replace function public.leaderboard(_period text)
returns table(user_id uuid, display_name text, points bigint, current_streak int) language sql stable security definer set search_path = public as $$
  with wk as (select date_trunc('week', public.game_today())::date as start)
  select p.id, p.display_name,
    case when _period='weekly' then
      coalesce((select sum(a.points_awarded) from answers a join questions q on q.id=a.question_id, wk where a.user_id=p.id and q.play_date >= wk.start),0)
      + coalesce((select sum(b.points) from daily_bonuses b, wk where b.user_id=p.id and b.play_date >= wk.start),0)
    else p.total_points end::bigint,
    p.current_streak
  from profiles p
  order by 3 desc, p.current_streak desc, p.display_name
  limit 100
$$;
revoke all on function public.leaderboard(text) from public, anon;
grant execute on function public.leaderboard(text) to authenticated;
