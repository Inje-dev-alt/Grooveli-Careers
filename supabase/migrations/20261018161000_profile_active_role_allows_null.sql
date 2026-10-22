-- active_role must accept NULL: a freshly registered account holds no role
-- yet (§2). Migration 20261018160300 relaxed the check and dropped the
-- default but left the NOT NULL constraint, which made the profiles insert
-- fail for every new account (SQLSTATE 23502).
--
-- Reversal:
--   update public.profiles set active_role = 'candidate' where active_role is null;
--   alter table public.profiles alter column active_role set not null;

alter table public.profiles alter column active_role drop not null;
