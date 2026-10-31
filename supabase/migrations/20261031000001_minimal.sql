-- Additive schema for the current Smaran frontend.
-- public.profiles / appointments / reminders already exist on this project with a different shape.
-- This migration adds the tables the integrated app uses, without dropping existing ones.

-- Extra profile fields used by the React app (safe no-ops if already present).
alter table public.profiles add column if not exists full_name text not null default '';
alter table public.profiles add column if not exists call_name text not null default '';
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists language text not null default 'hi';
alter table public.profiles add column if not exists time_zone text not null default 'Asia/Kolkata';
alter table public.profiles add column if not exists role text not null default 'self';
alter table public.profiles add column if not exists text_size text not null default 'large';
alter table public.profiles add column if not exists speaking_speed text not null default 'normal';
alter table public.profiles add column if not exists reminder_tone text not null default 'gentle';
alter table public.profiles add column if not exists quiet_hours jsonb not null default '{"enabled":true,"from":"22:00","to":"07:00"}';
alter table public.profiles add column if not exists voice_recordings boolean not null default false;
alter table public.profiles add column if not exists conversation_summaries boolean not null default true;
alter table public.profiles add column if not exists voice_cloning_consent boolean not null default false;
alter table public.profiles add column if not exists voice_cloning_consent_at timestamptz;
alter table public.profiles add column if not exists onboarding_mode text;
alter table public.profiles add column if not exists active_person_id text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- Copy display_name into full_name where the new column is still empty.
update public.profiles set full_name = display_name where coalesce(full_name, '') = '' and coalesce(display_name, '') <> '';

create table if not exists public.family_members (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  relationship text not null check (relationship in ('self','mother','father','other')),
  relationship_label text not null default '',
  display_name text not null default '',
  greeting_name text not null default '',
  language text not null default 'hi' check (language in ('hi','en','mr','kn')),
  time_zone text not null default 'Asia/Kolkata',
  speaking_speed text not null default 'normal' check (speaking_speed in ('normal','slower')),
  reminder_tone text not null default 'gentle' check (reminder_tone in ('gentle','standard')),
  sathi_voice text not null default 'default' check (sathi_voice in ('default','mom','dad')),
  notifications_enabled boolean not null default true,
  phone text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index if not exists family_members_owner_idx on public.family_members (owner_id);

create table if not exists public.medicines (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_member_id text,
  name text not null default '',
  dosage text not null default '',
  strength text not null default '',
  dose text not null default '',
  instructions text not null default '',
  notes text not null default '',
  purpose text,
  frequency text check (frequency in ('once','twice','thrice','custom')),
  times text[] not null default '{}',
  time_zone text not null default 'Asia/Kolkata',
  food text check (food in ('before','with','after','none')),
  duration text not null default 'ongoing' check (duration in ('ongoing','course')),
  course_days int check (course_days is null or course_days between 1 and 365),
  status text not null default 'draft' check (status in ('draft','confirmed','active','paused','completed','removed')),
  source text not null default 'manual' check (source in ('manual','prescription','voice','family')),
  source_text text,
  flags text[] not null default '{}',
  stock_settings jsonb,
  start_date date,
  end_date date,
  prescriber text,
  prescription_ref text,
  follow_up_date date,
  started_on date,
  activated_at timestamptz,
  color int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (family_member_id, owner_id) references public.family_members (id, owner_id) on delete cascade
);
create index if not exists medicines_owner_idx on public.medicines (owner_id, family_member_id);

create table if not exists public.medicine_schedules (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_member_id text,
  medicine_id text references public.medicines(id) on delete cascade,
  kind text not null default 'medicine' check (kind in ('medicine','custom','appointment')),
  title text not null default '',
  notes text,
  local_time text not null check (local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  frequency text,
  time_zone text not null default 'Asia/Kolkata',
  active boolean not null default true,
  start_at timestamptz not null default now(),
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (family_member_id, owner_id) references public.family_members (id, owner_id) on delete cascade
);
create index if not exists medicine_schedules_owner_idx on public.medicine_schedules (owner_id, family_member_id);

create table if not exists public.health_readings (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_member_id text,
  type text not null check (type in ('sugar','bp')),
  at timestamptz not null,
  value numeric,
  unit text check (unit in ('mg/dL','mmol/L')),
  context text check (context in ('fasting','before_meal','after_meal','random','unspecified')),
  systolic int,
  diastolic int,
  pulse int,
  note text,
  source text not null default 'manual' check (source in ('manual','voice','sample')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sugar_has_value check (type <> 'sugar' or value is not null),
  constraint bp_has_values check (type <> 'bp' or (systolic is not null and diastolic is not null and systolic > diastolic)),
  foreign key (family_member_id, owner_id) references public.family_members (id, owner_id) on delete cascade
);
create index if not exists health_readings_owner_idx on public.health_readings (owner_id, family_member_id, at desc);

-- Existing public.appointments / public.reminders belong to the previous product schema.
-- The current app writes to these dedicated tables instead.
create table if not exists public.member_appointments (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_member_id text,
  title text not null,
  doctor text,
  at timestamptz not null,
  time_zone text not null default 'Asia/Kolkata',
  notes text,
  reminder text not null default 'none' check (reminder in ('none','1h','1d','evening_before')),
  reminder_id text,
  status text not null default 'upcoming' check (status in ('upcoming','cancelled','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (family_member_id, owner_id) references public.family_members (id, owner_id) on delete cascade
);
create index if not exists member_appointments_owner_idx on public.member_appointments (owner_id, family_member_id);

create table if not exists public.member_reminders (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_member_id text,
  kind text not null check (kind in ('medicine','custom','appointment')),
  title text not null,
  notes text,
  medicine_id text references public.medicines(id) on delete set null,
  appointment_id text,
  schedule_id text references public.medicine_schedules(id) on delete set null,
  scheduled_for timestamptz not null,
  original_scheduled_for timestamptz not null,
  time_zone text not null default 'Asia/Kolkata',
  recurrence jsonb,
  status text not null default 'scheduled' check (status in ('scheduled','ringing','snoozed','completed','missed','cancelled','declined','skipped')),
  snooze_history jsonb not null default '[]',
  reschedule_history jsonb not null default '[]',
  completed_at timestamptz,
  cancelled_at timestamptz,
  skipped_at timestamptz,
  completion jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, idempotency_key),
  foreign key (family_member_id, owner_id) references public.family_members (id, owner_id) on delete cascade
);
create index if not exists member_reminders_owner_idx on public.member_reminders (owner_id, family_member_id, scheduled_for);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['family_members','medicines','medicine_schedules','health_readings','member_appointments','member_reminders'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, call_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), coalesce(new.raw_user_meta_data->>'call_name',''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.family_members enable row level security;
alter table public.medicines enable row level security;
alter table public.medicine_schedules enable row level security;
alter table public.health_readings enable row level security;
alter table public.member_appointments enable row level security;
alter table public.member_reminders enable row level security;
alter table public.family_members force row level security;
alter table public.medicines force row level security;
alter table public.medicine_schedules force row level security;
alter table public.health_readings force row level security;
alter table public.member_appointments force row level security;
alter table public.member_reminders force row level security;
alter table public.profiles enable row level security;

drop policy if exists family_members_own on public.family_members;
drop policy if exists medicines_own on public.medicines;
drop policy if exists medicine_schedules_own on public.medicine_schedules;
drop policy if exists health_readings_own on public.health_readings;
drop policy if exists member_appointments_own on public.member_appointments;
drop policy if exists member_reminders_own on public.member_reminders;
drop policy if exists profiles_own_smaran on public.profiles;

create policy family_members_own on public.family_members for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy medicines_own on public.medicines for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy medicine_schedules_own on public.medicine_schedules for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy health_readings_own on public.health_readings for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy member_appointments_own on public.member_appointments for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy member_reminders_own on public.member_reminders for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy profiles_own_smaran on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
