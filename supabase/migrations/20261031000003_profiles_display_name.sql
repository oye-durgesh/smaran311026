-- Existing public.profiles.display_name is NOT NULL with no default.
-- handle_new_user must populate it or email signup fails (23502).

alter table public.profiles alter column display_name set default '';

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n text := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'call_name', '');
begin
  insert into public.profiles (id, display_name, full_name, call_name)
  values (new.id, n, n, coalesce(new.raw_user_meta_data->>'call_name', n))
  on conflict (id) do nothing;
  return new;
end $$;
