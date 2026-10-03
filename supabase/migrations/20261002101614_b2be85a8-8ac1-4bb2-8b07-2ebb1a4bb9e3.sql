
-- Roles
create type public.app_role as enum ('admin','user');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  unique(user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role=_role)
$$;

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  total_points int not null default 0,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_played_date date,
  created_at timestamptz not null default now()
);
create unique index profiles_name_ci on public.profiles (lower(display_name));
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.clean_display_name(_n text)
returns text language plpgsql immutable set search_path = public as $$
declare n text;
begin
  n := regexp_replace(coalesce(_n,''), '[^A-Za-z0-9 _.\-]', '', 'g');
  n := btrim(regexp_replace(n, '\s+', ' ', 'g'));
  if length(n) < 2 or length(n) > 20 then raise exception 'Name must be 2-20 letters, numbers, spaces, _ . -'; end if;
  if lower(replace(replace(n,' ',''),'_','')) ~ '^(admin|administrator|moderator|mod|system|root|support|staff|official|fiveaside)' then
    raise exception 'That name is reserved';
  end if;
  return n;
end $$;

create or replace function public.profiles_validate()
returns trigger language plpgsql set search_path = public as $$
begin new.display_name := public.clean_display_name(new.display_name); return new; end $$;
create trigger profiles_validate before insert or update of display_name on public.profiles
for each row execute function public.profiles_validate();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare n text;
begin
  begin
    n := public.clean_display_name(new.raw_user_meta_data->>'display_name');
  exception when others then
    n := 'Player' || substr(replace(new.id::text,'-',''),1,6);
  end;
  if exists(select 1 from public.profiles where lower(display_name)=lower(n)) then
    n := left(n,15) || substr(replace(new.id::text,'-',''),1,4);
  end if;
  insert into public.profiles(id, display_name) values (new.id, n);
  insert into public.user_roles(user_id, role) values (new.id, 'user');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Questions
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  play_date date not null,
  order_index int not null check (order_index between 1 and 5),
  type text not null check (type in ('yes_no','which_first')),
  text text not null check (length(text) between 5 and 200),
  option_a_label text check (option_a_label is null or length(option_a_label) <= 60),
  option_b_label text check (option_b_label is null or length(option_b_label) <= 60),
  source_note text check (source_note is null or length(source_note) <= 300),
  xo_url text check (xo_url is null or (xo_url ~ '^https://[A-Za-z0-9.-]+(/[^\s<>"]*)?$' and length(xo_url) <= 500)),
  status text not null default 'draft' check (status in ('draft','live','resolved','void')),
  outcome text check (outcome in ('yes','no','a','b','void')),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (type='yes_no' or (option_a_label is not null and option_b_label is not null))
);
create index questions_date on public.questions(play_date, order_index);
grant select, insert, update, delete on public.questions to authenticated;
grant all on public.questions to service_role;
alter table public.questions enable row level security;
create policy "players read published" on public.questions for select to authenticated
  using (status <> 'draft' and play_date <= (now() at time zone 'utc')::date);
create policy "admin read all" on public.questions for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admin insert" on public.questions for insert to authenticated with check (public.has_role(auth.uid(),'admin') and outcome is null and resolved_by is null);
create policy "admin update" on public.questions for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin delete" on public.questions for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- Answers
create table public.answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  choice text not null check (choice in ('yes','no','a','b')),
  is_correct boolean,
  points_awarded int not null default 0,
  created_at timestamptz not null default now(),
  unique(user_id, question_id)
);
grant select on public.answers to authenticated;
grant all on public.answers to service_role;
alter table public.answers enable row level security;
create policy "read own answers" on public.answers for select to authenticated using (user_id = auth.uid());

create table public.daily_bonuses (
  user_id uuid not null references auth.users(id) on delete cascade,
  play_date date not null,
  points int not null,
  primary key(user_id, play_date)
);
grant select on public.daily_bonuses to authenticated;
grant all on public.daily_bonuses to service_role;
alter table public.daily_bonuses enable row level security;
create policy "read own bonuses" on public.daily_bonuses for select to authenticated using (user_id = auth.uid());

-- Submit today's answers (all at once)
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
  where q.play_date=today and q.status='live'
    and ((q.type='yes_no' and a->>'choice' in ('yes','no')) or (q.type='which_first' and a->>'choice' in ('a','b')));
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

-- Crowd split for questions the caller answered
create or replace function public.crowd_split(_date date)
returns table(question_id uuid, choice text, votes bigint) language sql stable security definer set search_path = public as $$
  select a.question_id, a.choice, count(*)
  from answers a join questions q on q.id=a.question_id
  where q.play_date=_date
    and exists(select 1 from answers mine where mine.user_id=auth.uid() and mine.question_id=a.question_id)
  group by a.question_id, a.choice
$$;
revoke all on function public.crowd_split(date) from public, anon;
grant execute on function public.crowd_split(date) to authenticated;

-- Leaderboard (public fields only)
create or replace function public.leaderboard(_period text)
returns table(user_id uuid, display_name text, points bigint, current_streak int) language sql stable security definer set search_path = public as $$
  with wk as (select date_trunc('week', (now() at time zone 'utc'))::date as start)
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

-- Scoring
create or replace function public.recompute_points(_uid uuid)
returns void language sql security definer set search_path = public as $$
  update profiles set total_points =
    coalesce((select sum(points_awarded) from answers where user_id=_uid),0)
    + coalesce((select sum(points) from daily_bonuses where user_id=_uid),0)
  where id=_uid;
$$;
revoke all on function public.recompute_points(uuid) from public, anon, authenticated;

create or replace function public.resolve_question(_question_id uuid, _outcome text)
returns void language plpgsql security definer set search_path = public as $$
declare q questions; d date; u uuid;
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Forbidden'; end if;
  select * into q from questions where id=_question_id for update;
  if not found then raise exception 'Question not found'; end if;
  if _outcome not in ('yes','no','a','b','void') then raise exception 'Invalid outcome'; end if;
  if _outcome <> 'void' and ((q.type='yes_no' and _outcome not in ('yes','no')) or (q.type='which_first' and _outcome not in ('a','b'))) then
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

-- Admin: players & stats
create or replace function public.admin_players()
returns table(user_id uuid, display_name text, total_points int, current_streak int, longest_streak int, last_played_date date, created_at timestamptz, answers_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Forbidden'; end if;
  return query select p.id, p.display_name, p.total_points, p.current_streak, p.longest_streak, p.last_played_date, p.created_at,
    (select count(*) from answers a where a.user_id=p.id) from profiles p order by p.total_points desc;
end $$;
revoke all on function public.admin_players() from public, anon;
grant execute on function public.admin_players() to authenticated;

create or replace function public.admin_stats(_date date)
returns table(players_today bigint, total_players bigint, total_answers bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Forbidden'; end if;
  return query select
    (select count(distinct a.user_id) from answers a join questions q on q.id=a.question_id where q.play_date=_date),
    (select count(*) from profiles),
    (select count(*) from answers);
end $$;
revoke all on function public.admin_stats(date) from public, anon;
grant execute on function public.admin_stats(date) to authenticated;

create or replace function public.admin_reset_player(_uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Forbidden'; end if;
  delete from answers where user_id=_uid;
  delete from daily_bonuses where user_id=_uid;
  update profiles set total_points=0, current_streak=0, longest_streak=0, last_played_date=null where id=_uid;
end $$;
revoke all on function public.admin_reset_player(uuid) from public, anon;
grant execute on function public.admin_reset_player(uuid) to authenticated;

-- Demo questions for today
insert into public.questions(play_date, order_index, type, text, option_a_label, option_b_label, status, source_note) values
((now() at time zone 'utc')::date, 1, 'yes_no', 'Will Chelsea keep a clean sheet before 1 Nov?', null, null, 'live', 'Demo question'),
((now() at time zone 'utc')::date, 2, 'which_first', 'Who leaves their job first?', 'De Zerbi (Tottenham)', 'Carrick (Man Utd)', 'live', 'Demo question'),
((now() at time zone 'utc')::date, 3, 'yes_no', 'Will Haaland score 15+ league goals before December?', null, null, 'live', 'Demo question'),
((now() at time zone 'utc')::date, 4, 'which_first', 'Which happens first?', 'Arsenal lose a league game', 'Liverpool drop to 3rd', 'live', 'Demo question'),
((now() at time zone 'utc')::date, 5, 'yes_no', 'Will any Premier League manager be sacked this month?', null, null, 'live', 'Demo question');
