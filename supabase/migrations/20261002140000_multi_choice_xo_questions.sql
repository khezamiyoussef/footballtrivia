-- Multi-choice questions sourced from XO Market events.
-- options: [{ "key": "o0", "label": "NVIDIA", "odds": 80.5, "xo_slug": "<market slug>" }, ...]
-- odds is a saved fallback (percent); the app shows live odds read from the XO event page.

alter table public.questions add column if not exists options jsonb;
alter table public.questions add column if not exists xo_event_slug text
  check (xo_event_slug is null or xo_event_slug ~ '^[a-z0-9-]{3,120}$');

alter table public.questions drop constraint if exists questions_type_check;
alter table public.questions drop constraint if exists questions_check;
alter table public.questions drop constraint if exists questions_outcome_check;
alter table public.answers drop constraint if exists answers_choice_check;

alter table public.questions add constraint questions_type_check check (type in ('yes_no','which_first','multi'));
alter table public.questions add constraint questions_check check (
  type = 'yes_no'
  or (type = 'which_first' and option_a_label is not null and option_b_label is not null)
  or (type = 'multi' and jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 8)
);
alter table public.questions add constraint questions_outcome_check check (
  outcome is null or outcome in ('yes','no','a','b','void') or outcome ~ '^o[0-9]$'
);
alter table public.answers add constraint answers_choice_check check (choice in ('yes','no','a','b') or choice ~ '^o[0-9]$');

create or replace function public.valid_choice(_type text, _options jsonb, _choice text)
returns boolean language sql immutable set search_path = public as $$
  select case _type
    when 'yes_no' then _choice in ('yes','no')
    when 'which_first' then _choice in ('a','b')
    when 'multi' then exists(select 1 from jsonb_array_elements(coalesce(_options, '[]'::jsonb)) o where o->>'key' = _choice)
    else false
  end
$$;

-- Same as before, but validates choices with valid_choice so multi-choice questions work.
create or replace function public.submit_answers(_answers jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
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

-- Same as before, but accepts any option key of a multi-choice question as the outcome.
create or replace function public.resolve_question(_question_id uuid, _outcome text)
returns void language plpgsql security definer set search_path = public as $$
declare q questions; d date; u uuid;
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Forbidden'; end if;
  select * into q from questions where id=_question_id for update;
  if not found then raise exception 'Question not found'; end if;
  if _outcome <> 'void' and not public.valid_choice(q.type, q.options, _outcome) then
    raise exception 'Outcome does not match question type';
  end if;
  d := q.play_date;
  update questions set outcome=_outcome, status=case when _outcome='void' then 'void' else 'resolved' end,
    resolved_at=now(), resolved_by=auth.uid() where id=_question_id;
  if _outcome='void' then
    update answers set is_correct=null, points_awarded=0 where question_id=_question_id;
  else
    update answers set is_correct=(choice=_outcome), points_awarded=case when choice=_outcome then 10 else 0 end where question_id=_question_id;
  end if;

  -- Perfect-day bonus: all 5 questions resolved (none void/pending) and user correct on all 5
  delete from daily_bonuses where play_date=d;
  if (select count(*) from questions where play_date=d and status='resolved') = 5
     and not exists(select 1 from questions where play_date=d and status in ('live','draft','void')) then
    insert into daily_bonuses(user_id, play_date, points)
    select a.user_id, d, 20 from answers a join questions qq on qq.id=a.question_id
    where qq.play_date=d group by a.user_id having count(*) filter (where a.is_correct) = 5;
  end if;

  for u in select distinct a.user_id from answers a join questions qq on qq.id=a.question_id where qq.play_date=d loop
    perform public.recompute_points(u);
  end loop;
end $$;
revoke all on function public.resolve_question(uuid,text) from public, anon;
grant execute on function public.resolve_question(uuid,text) to authenticated;

-- Replace today's demo questions with the five XO Market events (odds as of 2 Oct 2026).
delete from public.questions where play_date = (now() at time zone 'utc')::date;

insert into public.questions (play_date, order_index, type, text, options, xo_event_slug, xo_url, status) values
((now() at time zone 'utc')::date, 1, 'multi', 'Which will be the largest company by market cap at the end of 2026?',
 '[{"key":"o0","label":"NVIDIA","odds":80.5,"xo_slug":"largest-company-by-market-capitalization-at-the-en-3264"},
   {"key":"o1","label":"Apple","odds":15.25,"xo_slug":"largest-company-by-market-capitalization-at-the-en-2693"},
   {"key":"o2","label":"Alphabet","odds":10,"xo_slug":"largest-company-by-market-capitalization-at-the-en-5412"},
   {"key":"o3","label":"Any other","odds":2,"xo_slug":"largest-company-by-market-capitalization-at-the-en-2454"}]',
 'largest-company-by-market-capitalization-at-the-end-of-2026',
 'https://beta.xo.market/event/largest-company-by-market-capitalization-at-the-end-of-2026', 'live'),
((now() at time zone 'utc')::date, 2, 'multi', 'Who will be the next James Bond?',
 '[{"key":"o0","label":"Jack Lowden","odds":36.75,"xo_slug":"jack-lowden-will-be-announced-as-the-next-james-bo-6986"},
   {"key":"o1","label":"No Bond chosen","odds":25.85,"xo_slug":"no-actor-will-be-announced-as-the-next-james-bond-9942"},
   {"key":"o2","label":"Callum Turner","odds":7.15,"xo_slug":"callum-turner-will-be-announced-as-the-next-james--9805"},
   {"key":"o3","label":"Jack Barton","odds":4.55,"xo_slug":"jack-barton-will-be-announced-as-the-next-james-bo-7444"}]',
 'who-will-be-the-next-james-bond',
 'https://beta.xo.market/event/who-will-be-the-next-james-bond', 'live'),
((now() at time zone 'utc')::date, 3, 'multi', 'Which company has the best Chinese AI model on Oct 31?',
 '[{"key":"o0","label":"Alibaba","odds":32.5,"xo_slug":"alibaba-owns-the-top-chinese-model-on-chatbot-aren-1768"},
   {"key":"o1","label":"Moonshot","odds":16.8,"xo_slug":"moonshot-owns-the-top-chinese-model-on-chatbot-are-5549"},
   {"key":"o2","label":"Z.AI","odds":7.45,"xo_slug":"zai-owns-the-top-chinese-model-on-chatbot-arena-on-9122"}]',
 'best-chinese-ai-model-on-oct-31',
 'https://beta.xo.market/event/best-chinese-ai-model-on-oct-31', 'live'),
((now() at time zone 'utc')::date, 4, 'multi', 'Who wins the Ballon d''Or 2026?',
 '[{"key":"o0","label":"Lamine Yamal","odds":55.25,"xo_slug":"lamine-yamal-to-win-the-2026-ballon-dor-1340"},
   {"key":"o1","label":"Harry Kane","odds":38.95,"xo_slug":"harry-kane-to-win-the-2026-ballon-dor-5836"},
   {"key":"o2","label":"Any other player","odds":6.7,"xo_slug":"any-other-player-to-win-the-2026-ballon-dor-5647"}]',
 'who-wins-ballon-dor-2026',
 'https://beta.xo.market/event/who-wins-ballon-dor-2026', 'live'),
((now() at time zone 'utc')::date, 5, 'multi', 'Who wins the 2027 French presidential election?',
 '[{"key":"o0","label":"Marine Le Pen","odds":37.4,"xo_slug":"marine-le-pen-to-win-the-2027-french-presidential--4593"},
   {"key":"o1","label":"Edouard Philippe","odds":23.1,"xo_slug":"douard-philippe-to-win-the-2027-french-presidentia-1744"},
   {"key":"o2","label":"Any other candidate","odds":20.3,"xo_slug":"another-candidate-to-win-the-2027-french-president-5407"},
   {"key":"o3","label":"Jean-Luc Mélenchon","odds":6,"xo_slug":"jean-luc-mlenchon-to-win-the-2027-french-president-1265"}]',
 'france-presidential-election-2027',
 'https://beta.xo.market/event/france-presidential-election-2027', 'live');
