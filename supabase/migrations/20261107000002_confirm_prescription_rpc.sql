-- Atomic prescription confirmation + member FK on extraction_jobs.
-- confirm_prescription_medicines runs as one transaction: all inserts commit together or none do.

alter table public.extraction_jobs
  drop constraint if exists extraction_jobs_member_fk;
alter table public.extraction_jobs
  add constraint extraction_jobs_member_fk
  foreign key (family_member_id, owner_id)
  references public.family_members (id, owner_id)
  on delete cascade;

drop policy if exists extraction_jobs_own on public.extraction_jobs;
create policy extraction_jobs_own on public.extraction_jobs for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (
      family_member_id is null
      or exists (
        select 1 from public.family_members fm
        where fm.id = family_member_id and fm.owner_id = auth.uid()
      )
    )
  );

-- Same owner + prescription + name + strength cannot be inserted twice (concurrent confirm).
create unique index if not exists medicines_rx_name_strength_uidx
  on public.medicines (owner_id, prescription_ref, lower(btrim(name)), lower(btrim(coalesce(strength, ''))))
  where source = 'prescription' and prescription_ref is not null;

create or replace function public.confirm_prescription_medicines(
  p_prescription_id text,
  p_family_member_id text,
  p_medicines jsonb,
  p_prescriber text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  uid uuid := (select auth.uid());
  member public.family_members%rowtype;
  rx public.prescriptions%rowtype;
  item jsonb;
  med_id text;
  sch_id text;
  tz text;
  freq text;
  food text;
  duration text;
  times text[];
  t text;
  n_times int;
  notes text;
  start_d date;
  end_d date;
  course int;
  dose text;
  strength text;
  med_name text;
  med_ids text[] := '{}';
  sch_ids text[] := '{}';
  existing_count int;
begin
  if uid is null then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'permission_denied',
      'message', 'You cannot manage medicines for that family member.');
  end if;
  if p_prescription_id is null or pg_catalog.length(p_prescription_id) = 0 or pg_catalog.length(p_prescription_id) > 160
     or p_family_member_id is null or pg_catalog.length(p_family_member_id) = 0 or pg_catalog.length(p_family_member_id) > 160 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'not_found',
      'message', 'That prescription was not found.');
  end if;

  -- Serialize concurrent confirms of this prescription (same row, same owner).
  select * into member
  from public.family_members
  where id = p_family_member_id
    and owner_id = uid
    and active = true;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'permission_denied',
      'message', 'You cannot manage medicines for that family member.');
  end if;

  select * into rx
  from public.prescriptions
  where id = p_prescription_id
    and owner_id = uid
  for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'not_found',
      'message', 'That prescription was not found.');
  end if;
  if rx.family_member_id is distinct from p_family_member_id then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'permission_denied',
      'message', 'You cannot manage medicines for that family member.');
  end if;

  select count(*) into existing_count
  from public.medicines
  where owner_id = uid
    and family_member_id = p_family_member_id
    and prescription_ref = p_prescription_id;

  if rx.status = 'confirmed' or existing_count > 0 then
    update public.prescriptions
      set status = 'confirmed', confirmed_at = coalesce(confirmed_at, pg_catalog.now())
      where id = p_prescription_id and owner_id = uid and status is distinct from 'confirmed';
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'medicines', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) order by m.created_at)
        from public.medicines m
        where m.owner_id = uid
          and m.family_member_id = p_family_member_id
          and m.prescription_ref = p_prescription_id
      ), '[]'::jsonb),
      'schedules', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) order by s.local_time)
        from public.medicine_schedules s
        where s.owner_id = uid
          and s.family_member_id = p_family_member_id
          and s.medicine_id in (
            select id from public.medicines
            where owner_id = uid
              and family_member_id = p_family_member_id
              and prescription_ref = p_prescription_id
          )
      ), '[]'::jsonb)
    );
  end if;

  if p_medicines is null or pg_catalog.jsonb_typeof(p_medicines) <> 'array'
     or pg_catalog.jsonb_array_length(p_medicines) = 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'needs_confirmation',
      'message', 'Confirm at least one medicine before reminders can start.');
  end if;
  if pg_catalog.jsonb_array_length(p_medicines) > 40 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'needs_confirmation',
      'message', 'Too many medicines on this prescription. Confirm fewer at a time.');
  end if;

  for item in select value from pg_catalog.jsonb_array_elements(p_medicines)
  loop
    med_name := pg_catalog.btrim(coalesce(item->>'name', ''));
    dose := pg_catalog.btrim(coalesce(item->>'dose', ''));
    freq := pg_catalog.btrim(coalesce(item->>'frequency', ''));
    if pg_catalog.char_length(med_name) = 0 or pg_catalog.char_length(med_name) > 120 then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'needs_confirmation',
        'message', 'A medicine is missing its name. Enter it from the prescription or remove it.');
    end if;
    if pg_catalog.char_length(dose) = 0 or pg_catalog.char_length(dose) > 80 then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'missing_dosage',
        'message', format('Dosage for %s is missing. Enter it from the prescription or ask the doctor. Reminders were not created.', med_name));
    end if;
    if freq not in ('once', 'twice', 'thrice', 'custom') then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'missing_frequency',
        'message', format('Frequency for %s is unclear. Enter it from the prescription or ask the doctor. Reminders were not created.', med_name));
    end if;
    if item->'times' is null or pg_catalog.jsonb_typeof(item->'times') <> 'array'
       or pg_catalog.jsonb_array_length(item->'times') = 0 then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'needs_confirmation',
        'message', format('%s: Add at least one dose time.', med_name));
    end if;
    select pg_catalog.array_agg(x) into times
    from (
      select pg_catalog.btrim(value #>> '{}') as x
      from pg_catalog.jsonb_array_elements(item->'times')
    ) q;
    if times is null or exists (select 1 from pg_catalog.unnest(times) t0 where t0 !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'needs_confirmation',
        'message', format('%s: Each dose needs an exact clock time (HH:MM) from the prescription or the user.', med_name));
    end if;
    if (select count(*) from pg_catalog.unnest(times)) <> (select count(distinct u) from pg_catalog.unnest(times) u) then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'needs_confirmation',
        'message', format('%s: Two doses have the same time.', med_name));
    end if;
    n_times := case freq when 'once' then 1 when 'twice' then 2 when 'thrice' then 3 else pg_catalog.array_length(times, 1) end;
    if freq <> 'custom' and pg_catalog.array_length(times, 1) <> n_times then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'needs_confirmation',
        'message', format('%s needs %s daily dose time%s.', med_name, n_times, case when n_times = 1 then '' else 's' end));
    end if;
  end loop;

  tz := coalesce(nullif(member.time_zone, ''), 'Asia/Kolkata');

  for item in select value from pg_catalog.jsonb_array_elements(p_medicines)
  loop
    med_name := pg_catalog.btrim(item->>'name');
    strength := pg_catalog.btrim(coalesce(item->>'strength', ''));
    if exists (
      select 1 from public.medicines
      where owner_id = uid
        and family_member_id = p_family_member_id
        and lower(pg_catalog.btrim(name)) = lower(med_name)
        and lower(pg_catalog.btrim(strength)) = lower(strength)
    ) then
      continue;
    end if;

    select pg_catalog.array_agg(x) into times
    from (
      select pg_catalog.btrim(value #>> '{}') as x
      from pg_catalog.jsonb_array_elements(item->'times')
    ) q;

    food := case pg_catalog.btrim(coalesce(item->>'food', ''))
      when 'before' then 'before'
      when 'with' then 'with'
      when 'after' then 'after'
      else 'none'
    end;
    duration := case when item->>'duration' = 'course' then 'course' else 'ongoing' end;
    course := case
      when duration = 'course' and (item->>'courseDays') ~ '^[0-9]+$' then (item->>'courseDays')::int
      else null
    end;
    if course is not null and (course < 1 or course > 365) then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'needs_confirmation',
        'message', format('%s: Course length must be between 1 and 365 days.', med_name));
    end if;
    start_d := case when (item->>'startDate') ~ '^\d{4}-\d{2}-\d{2}$' then (item->>'startDate')::date else null end;
    end_d := case when (item->>'endDate') ~ '^\d{4}-\d{2}-\d{2}$' then (item->>'endDate')::date else null end;
    notes := nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ',
      nullif(item->>'notes', ''),
      nullif(item->>'specialInstructions', ''),
      case when nullif(item->>'brandName', '') is not null then 'Brand: ' || (item->>'brandName') end,
      case when nullif(item->>'genericName', '') is not null then 'Generic: ' || (item->>'genericName') end
    )), '');
    med_id := 'med_' || replace(pg_catalog.gen_random_uuid()::text, '-', '');

    insert into public.medicines (
      id, owner_id, family_member_id, name, dosage, strength, dose, instructions, notes, purpose,
      frequency, times, time_zone, food, duration, course_days, status, source, source_text,
      start_date, end_date, prescriber, prescription_ref, flags, started_on, activated_at
    ) values (
      med_id, uid, p_family_member_id, med_name,
      nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ', strength, item->>'dose')), ''),
      strength, pg_catalog.btrim(item->>'dose'),
      coalesce(nullif(item->>'sourceText', ''), nullif(item->>'specialInstructions', ''), ''),
      coalesce(notes, ''),
      null,
      pg_catalog.btrim(item->>'frequency'),
      times,
      tz,
      food,
      duration,
      course,
      'active',
      'prescription',
      nullif(item->>'sourceText', ''),
      start_d,
      end_d,
      left(nullif(p_prescriber, ''), 120),
      p_prescription_id,
      '{}',
      coalesce(start_d, (pg_catalog.now() at time zone tz)::date),
      pg_catalog.now()
    );

    med_ids := med_ids || med_id;

    foreach t in array times
    loop
      sch_id := 'sch_' || med_id || '_' || replace(t, ':', '');
      insert into public.medicine_schedules (
        id, owner_id, family_member_id, medicine_id, kind, title, local_time, frequency, time_zone, active, start_at, ends_on
      ) values (
        sch_id, uid, p_family_member_id, med_id, 'medicine', med_name, t, pg_catalog.btrim(item->>'frequency'), tz, true,
        case when start_d is not null then start_d::timestamp at time zone tz else pg_catalog.now() end,
        end_d
      );
      sch_ids := sch_ids || sch_id;
    end loop;
  end loop;

  update public.prescriptions
    set status = 'confirmed', confirmed_at = pg_catalog.now()
    where id = p_prescription_id and owner_id = uid;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'duplicate', coalesce(pg_catalog.array_length(med_ids, 1), 0) = 0,
    'medicines', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m))
      from public.medicines m
      where m.id = any (med_ids)
        and m.owner_id = uid
        and m.family_member_id = p_family_member_id
        and m.prescription_ref = p_prescription_id
    ), '[]'::jsonb),
    'schedules', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s))
      from public.medicine_schedules s
      where s.id = any (sch_ids)
        and s.owner_id = uid
        and s.family_member_id = p_family_member_id
        and s.medicine_id = any (med_ids)
    ), '[]'::jsonb)
  );
exception
  when unique_violation then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'medicines', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) order by m.created_at)
        from public.medicines m
        where m.owner_id = uid
          and m.family_member_id = p_family_member_id
          and m.prescription_ref = p_prescription_id
      ), '[]'::jsonb),
      'schedules', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) order by s.local_time)
        from public.medicine_schedules s
        where s.owner_id = uid
          and s.family_member_id = p_family_member_id
          and s.medicine_id in (
            select id from public.medicines
            where owner_id = uid
              and family_member_id = p_family_member_id
              and prescription_ref = p_prescription_id
          )
      ), '[]'::jsonb)
    );
end;
$$;

revoke all on function public.confirm_prescription_medicines(text, text, jsonb, text) from public;
revoke all on function public.confirm_prescription_medicines(text, text, jsonb, text) from anon;
grant execute on function public.confirm_prescription_medicines(text, text, jsonb, text) to authenticated;

comment on function public.confirm_prescription_medicines(text, text, jsonb, text) is
  'Atomically confirm a reviewed prescription into medicines + medicine_schedules. Validates auth.uid() and family-member ownership. Locks the prescription row. Idempotent for concurrent or repeat confirmation.';
