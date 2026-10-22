-- active_role must be nullable: a freshly registered account holds no role
-- yet - §2 /auth/register returns activeRole: null, and role selection is a
-- deliberate separate step.
--
-- Reversal:
--   update public.profiles set active_role = 'candidate' where active_role is null;
--   alter table public.profiles alter column active_role set default 'candidate';
--   alter table public.profiles drop constraint profiles_active_role_check;
--   alter table public.profiles add constraint profiles_active_role_check
--     check (active_role in ('candidate', 'employer'));

alter table public.profiles drop constraint if exists profiles_active_role_check;
alter table public.profiles alter column active_role drop default;
alter table public.profiles add constraint profiles_active_role_check
  check (active_role is null or active_role in ('candidate', 'employer'));
