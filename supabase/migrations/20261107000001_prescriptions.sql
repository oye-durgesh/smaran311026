-- Private prescription files, extraction jobs, and member-scoped access.
-- Does not change existing medicines / medicine_schedules / member_reminders columns.

create table if not exists public.prescriptions (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_member_id text not null,
  storage_path text not null,
  file_name text not null default '',
  mime text not null,
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 10485760),
  language text not null default 'en-IN',
  content_sha256 text not null,
  status text not null default 'uploaded' check (status in ('uploaded','extracting','extracted','confirmed','failed')),
  extraction_job_id text,
  patient_name text,
  doctor_name text,
  prescription_date text,
  raw_extract jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (owner_id, family_member_id, content_sha256),
  foreign key (family_member_id, owner_id) references public.family_members (id, owner_id) on delete cascade
);
create index if not exists prescriptions_owner_idx on public.prescriptions (owner_id, family_member_id);

create table if not exists public.extraction_jobs (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'sarvam',
  sarvam_job_id text,
  file_name text not null default '',
  mime text not null default '',
  size_bytes int not null default 0,
  language text not null default 'en-IN',
  output_format text not null default 'json',
  status text not null default 'submitted',
  pages jsonb,
  error_code text,
  error_message text,
  retry_after_sec int,
  result jsonb,
  document_id text,
  family_member_id text,
  content_sha256 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists extraction_jobs_owner_idx on public.extraction_jobs (owner_id, created_at desc);

drop trigger if exists touch_prescriptions on public.prescriptions;
create trigger touch_prescriptions before update on public.prescriptions for each row execute function public.touch_updated_at();
drop trigger if exists touch_extraction_jobs on public.extraction_jobs;
create trigger touch_extraction_jobs before update on public.extraction_jobs for each row execute function public.touch_updated_at();

alter table public.prescriptions enable row level security;
alter table public.extraction_jobs enable row level security;
alter table public.prescriptions force row level security;
alter table public.extraction_jobs force row level security;

drop policy if exists prescriptions_own on public.prescriptions;
create policy prescriptions_own on public.prescriptions for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.family_members fm
      where fm.id = family_member_id and fm.owner_id = auth.uid() and fm.active = true
    )
  );

drop policy if exists extraction_jobs_own on public.extraction_jobs;
create policy extraction_jobs_own on public.extraction_jobs for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'prescriptions',
  'prescriptions',
  false,
  10485760,
  array['application/pdf', 'image/png', 'image/jpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists prescriptions_storage_select on storage.objects;
create policy prescriptions_storage_select on storage.objects for select
  using (bucket_id = 'prescriptions' and split_part(name, '/', 1) = auth.uid()::text);

drop policy if exists prescriptions_storage_insert on storage.objects;
create policy prescriptions_storage_insert on storage.objects for insert
  with check (bucket_id = 'prescriptions' and split_part(name, '/', 1) = auth.uid()::text);

drop policy if exists prescriptions_storage_delete on storage.objects;
create policy prescriptions_storage_delete on storage.objects for delete
  using (bucket_id = 'prescriptions' and split_part(name, '/', 1) = auth.uid()::text);
