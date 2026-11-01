-- Batch 5.1 — a global platform, and the timezone that makes it honest.
--
-- Two things. The column is a correctness fix; the seed is content.
--
-- Reversal:
--   alter table public.profiles drop column if exists timezone;
--   (the seed changes are data, and restoring them means re-running
--    20261018160200 against the affected rows)

/* ---------------------------------------------------------- timezone --- */

/**
 * The account's IANA timezone, e.g. `Africa/Lagos`, `Europe/London`.
 *
 * QUIET HOURS ARE ALREADY WRONG WITHOUT THIS, and have been since they
 * shipped. `notification_preferences` stores two bare hour numbers with no
 * zone attached, so "no reminders between 22:00 and 07:00" is evaluated in
 * whatever zone the server happens to run in — UTC. Someone in Lagos is
 * silenced an hour early, someone in Toronto through their afternoon, and
 * someone in Singapore at breakfast.
 *
 * It has been a dormant inaccuracy because nothing sends on a schedule yet.
 * The reminder scheduler turns it into notifications arriving in the middle
 * of people's nights, which is why this lands first.
 *
 * DEFAULT 'UTC', NOT A GUESS. Every existing row is currently evaluated in
 * UTC, so UTC is the only default that changes nobody's behaviour on
 * migration. The client sends the browser's real zone the next time
 * preferences are saved, and onboarding captures it for new accounts.
 */
alter table public.profiles
  add column if not exists timezone text not null default 'UTC';

/*
 * Not constrained to a list. IANA publishes new zones and renames old ones
 * several times a year; a check constraint here would mean a migration every
 * time a country changed its mind about daylight saving. The server validates
 * against the runtime's own zone database instead, which is always current.
 */

/* ------------------------------------------------------------ global --- */

/*
 * The demo market was entirely Lagos and Abuja. It is now spread across seven
 * cities on four continents, each with its own currency, so the product
 * demonstrates what it claims to be.
 *
 * SCOPED TO THE SEEDED ROWS ONLY. Every id below is a readable one written by
 * 20261018160200; organizations created through the API get `org-<8 hex>`, so
 * a real employer's own location and currency are never touched by this.
 */

update public.organizations set location = 'London, United Kingdom'
  where id in ('org-meridian', 'org-harbour-co');
update public.organizations set location = 'New York, United States'
  where id in ('org-northwind', 'org-signal-labs');
update public.organizations set location = 'Nairobi, Kenya'
  where id = 'org-brightpath';
update public.organizations set location = 'Toronto, Canada'
  where id = 'org-azure-bay';
update public.organizations set location = 'Berlin, Germany'
  where id = 'org-lumen';
update public.organizations set location = 'Singapore'
  where id = 'org-atlas-holdings';
-- Keystone and Vitalis stay in Lagos: globalising does not mean leaving.

/*
 * Jobs follow their employer, in that employer's currency.
 *
 * Salary figures are left alone deliberately. Converting them would invent
 * exchange rates nobody chose and make the seed look authoritative about
 * numbers it is not; a London role advertising 450,000 is wrong in a way a
 * reader can see and correct, where a plausible converted figure is wrong in
 * a way they cannot.
 */
update public.jobs j
set location = o.location,
    currency = case
      when o.location like '%United Kingdom' then 'GBP'
      when o.location like '%United States'  then 'USD'
      when o.location like '%Kenya'          then 'KES'
      when o.location like '%Canada'         then 'CAD'
      when o.location like '%Germany'        then 'EUR'
      when o.location = 'Singapore'          then 'SGD'
      else 'NGN'
    end
from public.organizations o
where j.organization_id = o.id
  and o.id in (
    'org-meridian', 'org-harbour-co', 'org-northwind', 'org-signal-labs',
    'org-brightpath', 'org-azure-bay', 'org-lumen', 'org-atlas-holdings'
  );
