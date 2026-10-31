# Grooveli Careers — build brief

A complete specification for building this product from nothing. Written to be
executed: every section states what to build and the rule that makes it
correct. Where a rule looks arbitrary it is load-bearing, and the reason is
given.

---

## 1. The product

A two-sided career marketplace — job seekers and employers — experienced as a
city you walk around in a browser.

**It is not a game about jobs.** It is a career platform whose interface is a
city. Every mechanic maps to real career work: a mission is structured job
seeking, an interview simulation is scored and goes on the record, experience
points are earned for things an employer could check. Nothing rewards time
spent in the product.

**The promise is proof instead of promises.** A CV asserts; this platform
evidences. A candidate finishes assessments, courses and simulations, and the
result is a profile an employer can verify rather than believe.

Both sides inhabit the same world. A candidate walks into a company's office
and reads its open roles. An employer has a headquarters, a hiring pipeline,
and a presence in the same lobbies — so the two can meet.

### The four principles

1. **The city is the interface, not the content.** Every screen must also be
   reachable without walking. The world is a way in, never the only way.
2. **Earned means verifiable.** If an employer could not check it, it does not
   move reputation.
3. **Two numbers, deliberately.** Experience measures activity. Reputation
   measures verified work. Never merge them.
4. **Consequences are real.** This is someone's career, not an avatar's. Privacy
   defaults protect the person, and moderation ships with the feature that needs
   it, never after.

---

## 2. The two journeys

Build these end to end before building anything else. They are the demo.

**Candidate:** sign up → choose the candidate role → onboarding (career path,
skills, location, work preferences) → arrive in the city → run missions, take
courses, sit interview simulations → earn experience, reputation and
achievements → browse matched roles → apply → track the application through its
stages → get hired.

**Employer:** sign up → choose the employer role → create an organization →
publish roles → see applicants ranked by match → move them through the pipeline
with feedback → message candidates → read hiring analytics.

---

## 3. Domain model

Postgres. Table names are plural; ids are text where they are human-readable
and uuid where they are not.

### Identity

| Table | Key columns | Notes |
| --- | --- | --- |
| `profiles` | `id` (= auth user), `display_name`, `roles[]`, `active_role` | One row per account. An account may hold both roles and switches between them. |
| `candidate_profiles` | `user_id`, `headline`, `summary`, `location`, `skills[]`, `career_path_id`, `years_experience`, `work_types[]`, `salary_min` | Created at onboarding, not at registration. Its absence means onboarding is unfinished. |
| `organizations` | `id`, `name`, `industry`, `size_band`, `location`, `district_id`, `verified`, `follower_count` | |
| `organization_memberships` | `organization_id`, `user_id`, `role` | `owner`/`admin`/`recruiter`/`hiring-manager`. Unique on the pair. |

### Marketplace

| Table | Key columns | Notes |
| --- | --- | --- |
| `jobs` | `id`, `organization_id`, `title`, `description`, `skills[]`, `employment_type`, `work_type`, `experience_level`, `salary_min/max`, `currency`, `district_id`, `status` | `status`: draft, published, paused, closed. |
| `applications` | `id`, `job_id`, `candidate_user_id`, `status`, `match_score`, `feedback` | **One table, two views.** The employer's pipeline and the candidate's list are the same rows. Never build two. |
| `application_events` | `application_id`, `from_status`, `to_status`, `created_at` | Stage history. Also the source for employer responsiveness metrics. |
| `saved_jobs` | `user_id`, `job_id` | |

Application statuses: `applied`, `under-review`, `shortlisted`, `assessment`,
`interview`, `offer`, `hired`, `rejected`, `withdrawn`.

### Progression

| Table | Purpose |
| --- | --- |
| `career_progress` | `xp`, `reputation` per account. The two headline numbers. |
| `career_events` | **The ledger of record.** Every event ever recorded, with the idempotency key it was awarded under. |
| `xp_ledger` | Every award with its reason, for an auditable history. |
| `career_stats` | Derived counters: applications, certifications, assessments passed. |
| `achievements`, `achievement_progress` | Earned badges and how many times each trigger has fired. |
| `career_activity` | The human-readable stream, with a `shareable` flag. |

### Missions, learning, assessment

| Table | Notes |
| --- | --- |
| `missions`, `mission_objectives`, `mission_progress` | An objective listens for an event name **plus an optional context key/value**. Without that discriminator, four missions listening for `skill.challenge` all complete at once. |
| `courses`, `course_enrollments` | Enrolment is a row, not a click, so completion can happen once. |
| `interviews`, `interview_questions`, `interview_attempts` | The answer key is **never** served to the client. Score is computed server-side from the attempt. |

### Social

| Table | Notes |
| --- | --- |
| `posts`, `post_likes`, `post_comments` | An author is a user **or** an organization, never both and never neither — two nullable columns with a check, so foreign keys stay real. Like counts are derived, never stored. |
| `connections` | `requester_id`, `addressee_id`, `status`. **Unique on the ordered pair** so A→B and B→A collide. |
| `follows` | A user follows an organization. Distinct from a connection. |
| `referrals` | One ask per person per application. |
| `post_reports`, `blocked_authors` | The two moderation verbs. A block means not in my feed, not in my messages, not in my room — one table, one meaning. |

### Presence and messaging

| Table | Notes |
| --- | --- |
| `presence` | One row per account, **overwritten** not appended: a position, not a history. |
| `conversations` | Unique on the ordered pair. Records where the two met. |
| `messages` | `read_at` per message, not a cursor per thread. |
| `conversation_reports` | |

### Notifications

`notifications` (typed, with a route to open) and `notification_preferences`
(reminders on/off, quiet hours **with an IANA timezone** — bare hour numbers are
wrong for everyone outside the server's zone).

---

## 4. The rules that define correctness

These are the specification. Get them wrong and the product is subtly broken in
ways tests rarely catch.

### Experience and reputation

- **Experience** moves on activity: applying, completing a mission, visiting a
  district.
- **Reputation** moves only on work a third party could verify: a passed
  assessment, a finished course, a completed interview.
- The leaderboard ranks on **reputation**. Ranked on experience it becomes a
  farming contest within a week.

### One write for progression

Every award flows through a single `recordCareerEvent(event, context)` that fans
out, in one transaction, to experience, reputation, statistics, missions,
achievements, activity and notices. Do not let six endpoints each award
separately — they will disagree.

### Awards are keyed on the thing, not the click

An application award keys on `application_id`; a course on `course_id`; a skill
on the skill name; a district visit on the district. The database enforces one
award per thing. **Never key on a timestamp, a session or a request id** — those
make a replay look like new work.

A replayed event must report **zero** awarded, not the original amount, or the
interface congratulates the user for experience nobody earned.

### Matching

A match score between a candidate and a job, computed server-side from skill
overlap, experience level, location and work type. Above a threshold the
application is "suitable" and worth experience; below it, applying is not an
achievement. Show the score and the exact missing skills — an opaque percentage
teaches nobody anything.

### Presence privacy

Visibility governs whether an account is **named**, not whether it is
**counted**. Three settings:

- `everyone` — named to anyone, counted.
- `connections` — **the default.** Named to accepted connections; everyone else
  sees an anonymous body in the room.
- `nobody` — absent from rosters *and* from counts.

A count that ticks 0→1 when an invisible person walks in is a leak by
arithmetic. Apply exclusions **before** counting, in one shared predicate, or
they will be forgotten by the next surface that reads the data.

This matters because the product is a career platform: being seen in a
competitor's lobby has a real-world cost, and that cost requires being
identifiable, not merely present.

### Messaging anti-spam

The **one-message invite**: you may send exactly one message to someone you have
no accepted connection with. Until they reply you cannot send another. An
accepted connection lifts it.

This kills bulk messaging without putting a request wall between two people
standing in the same room — which is the entire point of giving them a room. A
refusal must never reveal that the other person blocked you.

### Moderation

Reports create rows for human review and **never** take anything down
automatically — a reporting system that acts on the first click is a harassment
weapon. Blocking is the instant action, it belongs to the person affected, and
it works in both directions.

---

## 5. The world layer

A top-down city rendered in a canvas game framework, lazy-loaded so the rest of
the product boots without it.

**Districts are data.** Each has an id, position, size, accent colour and a list
of interaction ids. Adding a building is a data entry; adding a behaviour is a
registry entry. No building has its own component.

**One interaction registry** maps interaction ids to what they do. The world
knows ids; the registry knows meaning; neither knows the other's business.

**One place registry** resolves an id to a place across every room. Never write
a second lookup chain — a room registered in one and missing from the other
produces furniture that prompts and opens nothing, with no error anywhere.

**Depth sorting by world `y`.** The player's depth is its `y`; a building's is
its front edge. Everything drawn follows this or it will overlap wrongly.

**Interiors are parameterised.** One interior scene takes a room definition and
an object list, so a new room is a data file and a tiny subclass. Build at least
four: the candidate's apartment, an employer headquarters, a company office a
candidate can visit, and the plaza.

**Leaving a building returns you to its door**, not to the map's spawn point.
Hold the intended arrival in a store, because leaving is a route change and the
scene is rebuilt.

---

## 6. Technical architecture

### Stack

React with Vite, a small client state library (Zustand or equivalent), a canvas
game framework for the world, Postgres behind serverless functions. Any
equivalent stack is fine; the layering is not.

### Layering

```
component → store → service → apiClient → API router → database
```

Each arrow is a boundary:

- **One module calls `fetch`.** Nothing else constructs a request. One place for
  auth, one for error normalisation, one to swap transport.
- **Every service call is `withMock(mockFn, realFn, surface?)`.** Build the
  whole product against mocks first, then replace them one surface at a time
  with a flag. This is what lets the interface be finished before the backend
  is, without the interface being a lie.
- **Stores hold no transport and services hold no React.**

### Security

Enable row-level security on every table and write **no policies**. All access
goes through the API's service-role client. One security model, one place to
audit. If something later needs direct database access from the browser, that is
a deliberate second model with its own review, not a convenience.

**No provider secret may reach the browser.** Anything inlined into a client
bundle is public. Model and payment credentials live server-side only.

### API conventions

- One error shape everywhere: `{ code, message, details }`. `message` is shown
  to users verbatim, so write it for a person; `code` is for branching.
- Match routes on **segment count** so `/x/read-all` and `/x/:id/read` cannot
  collide.
- Notices are best-effort: a failed notification must never fail the thing it
  was about.
- Return the state as it now stands after a write, so the client never assumes.

---

## 7. API surface

Roughly a hundred endpoints. Grouped:

`/auth` register, login, logout · `/users/me` profile, roles, presence
visibility, notification preferences · `/onboarding` · `/candidates` create and
search · `/jobs` list with filters, detail, save · `/applications` create, list,
update status, withdraw · `/organizations` directory, profile, publish, pipeline,
analytics · `/career/events` the single progression write · `/missions` list,
progress, complete · `/learning/courses` list, enrol, complete · `/interviews`
list, start, answer, submit · `/social` posts, likes, comments, connections,
follows, referrals, reports, blocks · `/notifications` feed, read, read-all ·
`/leaderboard` with opt-out · `/presence/heartbeat` and room occupancy ·
`/conversations` open, list, messages, read, report · `/ai` chat, briefing,
recommendations, assessment grading.

---

## 8. Build order

Each phase ends with something demonstrable. Do not build horizontally.

**Phase 1 — the spine.** Auth, roles, onboarding, profiles. A person can sign
up, choose a side and complete setup. No city yet.

**Phase 2 — the marketplace.** Jobs, matching, applications, the employer
pipeline. Both journeys work end to end as ordinary screens. **This is the
product**; everything after it is leverage.

**Phase 3 — progression.** The single career-event write, experience,
reputation, statistics, achievements, activity. Wire it into applying and
onboarding so the numbers mean something immediately.

**Phase 4 — the city.** The world, districts, the interaction registry, the
apartment. Every screen from phases 1–3 becomes reachable by walking, and still
reachable without.

**Phase 5 — depth.** Missions, courses, interview simulations. These are what
turn a job board into a career platform.

**Phase 6 — people.** Social feed, connections, referrals, notifications,
leaderboard, moderation.

**Phase 7 — together.** Presence and messaging. Only now, because they need a
population to be anything.

**Phase 8 — intelligence.** The AI assistant: profile scanning, skill-gap
diagnosis, recommendations, mock interviews. Last because it is the easiest to
fake convincingly and the easiest to get wrong expensively.

---

## 9. What "done" means

Per phase, not at the end:

- Both journeys still complete end to end.
- Every rule in section 4 holds, tested with **two accounts**, not one. Most
  rules here are about what a *second* person sees, and a single-account test
  cannot see them.
- Replaying any award grants nothing and reports zero.
- Signing out and in as someone else shows none of the previous account's data.
- Every client call maps to a real endpoint — automate this check; it catches
  drift nothing else does.

---

## 10. Pitfalls

Each of these costs a day to find and a minute to avoid.

**A mock that agrees with itself proves nothing.** Mirror server rules in mocks
so the interface is reachable, never to verify them. Rules about a second person
need a second account against the real backend.

**Stores outlive sign-out.** Signing out rarely reloads the page. Every store
needs a reset and a single sweep that calls all of them; one store missing from
that sweep leaks one account's data into the next.

**Two copies of one lookup.** The moment a resolution rule exists in two places,
one will miss the next case added, and the failure will be silent.

**Silent fallbacks.** If a path degrades, say so in a log. A fallback that looks
like the normal state makes a crash and a missing file indistinguishable.

**Unmount cleanups that mutate shared state.** In React strict mode a mounting
effect runs effect → cleanup → effect, so such a cleanup fires *during* mount. A
component may clean up its own timer; it may not clear somebody else's state.

**Field names drifting from column names.** The API shape is the contract. A
column called `size_band` does not make the response field `sizeBand` if every
screen reads `size`.

**Opt-outs applied at render.** Apply them before the counting and the ranking,
or the number itself leaks what the setting was meant to hide.

**No automated checks.** Lint, build and type-check on every commit from day
one. Retrofitting a safety net after a hundred endpoints exist is the most
expensive ordering available.
