-- Existing product policies on public.profiles still query family_memberships,
-- which queries profiles again (Postgres 42P17). Keep only the owner-row policy.

do $$
declare pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname <> 'profiles_own_smaran'
  loop
    execute format('drop policy if exists %I on public.profiles', pol.policyname);
  end loop;
end $$;

drop policy if exists profiles_own_smaran on public.profiles;
create policy profiles_own_smaran on public.profiles
  for all
  using (id = auth.uid())
  with check (id = auth.uid());
