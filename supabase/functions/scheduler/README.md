# The reminder sweep

A second Edge Function, invoked on a schedule rather than by a person. It asks
one question of the whole table — who has an active mission they have not been
nudged about in 24 hours — and writes one notice to each of them.

Deployed like any other function:

```
supabase functions deploy scheduler --project-ref <ref>
```

It will not do anything until something calls it on a schedule.

## Scheduling it

This is a **one-time setup step, done once per project**, and it is deliberately
not a migration. The SQL below embeds a reference to a secret that belongs to
your project rather than to this repository, and a migration that silently
depends on a vault entry existing is a landmine for whoever runs it next on a
fresh database.

Run it once, in the SQL editor.

**1. Store the service-role key in Vault.** The function authenticates the
caller by comparing the bearer token against its own service-role key, so the
scheduler has to send it. Putting it in Vault keeps it out of the cron
definition, where it would otherwise be readable by anyone who can list jobs.

```sql
select vault.create_secret(
  '<your service_role key>',
  'scheduler_key',
  'Service-role key used by the reminder sweep'
);
```

**2. Schedule the sweep.** Every thirty minutes. Frequent enough that somebody
leaving quiet hours is nudged within half an hour, infrequent enough that the
sweep is cheap — and because the cooldown is 24 hours, the interval only
affects *when* a reminder lands, never how many are sent.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'grooveli-reminder-sweep',
  '*/30 * * * *',
  $$
  select net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/scheduler',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret
                                     from vault.decrypted_secrets
                                     where name = 'scheduler_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

**3. Check it is running.**

```sql
select jobname, schedule, active from cron.job;
select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'grooveli-reminder-sweep')
order by start_time desc limit 5;
```

To stop it: `select cron.unschedule('grooveli-reminder-sweep');`

## Calling it by hand

Useful for testing, and the only way to see its summary directly:

```
curl -X POST https://<project-ref>.supabase.co/functions/v1/scheduler \
  -H "Authorization: Bearer <service_role key>"
```

```json
{ "ok": true, "swept": 12, "notified": 9, "skippedQuiet": 2, "skippedOff": 1, "stamped": 14 }
```

- **swept** — people with at least one mission due a nudge
- **notified** — people who got one
- **skippedQuiet** — people it is the middle of the night for
- **skippedOff** — people who turned reminders off
- **stamped** — mission rows whose cooldown was reset

`swept` minus `notified` should always equal `skippedQuiet + skippedOff` plus
anyone whose mission no longer exists. If it does not, something failed to
write and the logs will say which account.

## Two decisions worth knowing

**Skipped, not deferred.** Somebody in quiet hours keeps their old stamp rather
than being queued, so the next sweep after they wake finds them still due.
Nothing is stored about the attempt, and a missed run is harmless because the
following one picks up everyone it would have.

**Stamped only when notified.** Stamping every row the sweep examined would
restart the cooldown for someone who was asleep, so they would wait another
full day without ever having been told anything — a reminder system that
reliably reminds nobody.

## What is not here

**Email.** The plan asks for email digests alongside the in-app notices. There
is no email infrastructure in this project at all — no provider, no templates,
no sending code — so this writes notification rows only. Adding email is a
separate piece of work with a vendor decision in it, and it would plug in at
the single `notifications.insert` call in `index.ts`.
