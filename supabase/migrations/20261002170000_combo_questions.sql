-- 2x combo questions: the admin can mark any question; a correct pick on it scores 20 instead of 10.
alter table public.questions add column if not exists is_double boolean not null default false;

-- Same as before, but combo questions award double points.
create or replace function public.resolve_question(_question_id uuid, _outcome text)
returns void language plpgsql security definer set search_path = public as $$
declare q questions; d date; u uuid; pts int;
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Forbidden'; end if;
  select * into q from questions where id=_question_id for update;
  if not found then raise exception 'Question not found'; end if;
  if _outcome <> 'void' and not public.valid_choice(q.type, q.options, _outcome) then
    raise exception 'Outcome does not match question type';
  end if;
  pts := case when q.is_double then 20 else 10 end;
  d := q.play_date;
  update questions set outcome=_outcome, status=case when _outcome='void' then 'void' else 'resolved' end,
    resolved_at=now(), resolved_by=auth.uid() where id=_question_id;
  if _outcome='void' then
    update answers set is_correct=null, points_awarded=0 where question_id=_question_id;
  else
    update answers set is_correct=(choice=_outcome), points_awarded=case when choice=_outcome then pts else 0 end where question_id=_question_id;
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

-- Share page shows the combo badge too.
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
        'status', q.status, 'outcome', q.outcome, 'is_double', q.is_double,
        'choice', a.choice, 'is_correct', a.is_correct
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
