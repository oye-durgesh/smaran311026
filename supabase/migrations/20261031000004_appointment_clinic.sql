-- Additive: clinic/hospital on family appointments. Does not drop or rewrite existing rows.
alter table public.member_appointments add column if not exists clinic text;
