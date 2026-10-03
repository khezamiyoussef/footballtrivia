-- 20-second timer: the admin can tick any question. If a player runs out of time the answer is
-- saved as 'timeout', which counts as answered (so they can still lock in) but never scores.
alter table public.questions add column if not exists has_timer boolean not null default false;

alter table public.answers drop constraint if exists answers_choice_check;
alter table public.answers add constraint answers_choice_check
  check (choice in ('yes','no','a','b','timeout') or choice ~ '^o[0-9]$');

-- Same as before, but 'timeout' is accepted on timed questions.
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
  where q.play_date=today and q.status='live'
    and (public.valid_choice(q.type, q.options, a->>'choice') or (q.has_timer and a->>'choice' = 'timeout'));
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
