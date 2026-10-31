# Grooveli Careers — system description

Written for an engineer or agent joining this codebase cold. The README is a
product tour; this is the contract. Read the **Invariants** and **Landmines**
sections before changing anything — most of them exist because the alternative
was tried and broke something quietly.

---

## 1. What it is

A two-sided career marketplace — candidates and employers — experienced as a
browser city you walk around. It is **not a game about jobs**. Every mechanic
maps to real career work: missions are structured job-seeking activity,
interview simulations are scored and go on your record, XP is earned for things
an employer could verify. The city is the interface, not the product.

Both sides exist in the same world. A candidate walks into a company's office
and reads its open roles; an employer has a headquarters, a hiring pipeline and
a presence in the same lobbies.

## 2. Stack

| Layer | Technology |
| --- | --- |
| UI | React 19, Vite 7, plain CSS with design tokens |
| State | Zustand 5 (14 stores) |
| Routing | React Router 7 |
| World | Phaser 3.90, lazy-loaded, no art assets — everything drawn from shapes |
| API | One Supabase Edge Function (`api`), Deno/TypeScript, hand-rolled router |
| Data | Postgres via Supabase, 38 tables, 20 migrations |

Scale: 164 source files, 97 API routes, 19 services, 9 live test suites.

## 3. Request path

```
component → store → service → apiClient → Edge Function router → Postgres
```

Each arrow is a hard boundary. A component never calls a service's transport, a
store never holds a fetch, and nothing below `apiClient` knows React exists.

## 4. Invariants

Break these and something fails silently rather than loudly.

**`apiClient.js` is the only module that calls `fetch`.** No component, store or
service constructs a request. One place to add auth, one place to normalise
errors, one place to swap transport.

**Every service call is `withMock(mockFn, realFn, surface?)`.** Services read as
"the real call, or the mock". The remaining mock surface is greppable:
`grep -r withMock`. `VITE_MOCK_SURFACES` keeps individual surfaces on mock data
while the rest go live — today it holds only `ai`.

**The router matches on segment count.** `parts.length !== route.segments.length`
means no match, so `/x/read-all` (2 segments) and `/x/:id/read` (3) can never
collide. Register literal paths before parameterised ones anyway.

**RLS is enabled on every table with no policies at all.** Nothing reaches the
database except the `api` function's service-role client. There is deliberately
no second security model — this is why presence polls through the router rather
than using Supabase Realtime, which would need policies on `realtime.messages`.

**No provider secret may reach the browser.** Every `VITE_` variable is inlined
into the public bundle. AI calls go to the backend, which holds the key.

**Awards are keyed on the thing they are about, not on the click.** An
application award keys on `applicationId`, a course on `courseId`, a skill on
`skill`. The database enforces one award per thing. Never key on a timestamp or
a request id.

**`recordCareerEvent` is the single write for progression.** It fans out to XP,
reputation, missions, achievements, activity and notices in one transaction
(`apply_career_event`). Six older direct-write endpoints answer `410` and must
stay that way.

**XP and reputation are different numbers on purpose.** XP moves on activity;
reputation moves only on work someone else could verify. The leaderboard ranks
on reputation, or it becomes a farming contest.

## 5. The game layer

Phaser is isolated under `src/game/` and talks to React only through
`gameBridge` events and Zustand stores. It can be replaced without touching the
product.

- **`world/locations.js`** — the eleven districts as data: id, position, size,
  interactions. Also `doorwayPosition()`, the single definition of where a
  building's door is.
- **`world/places.js`** — the registry mapping a scene to its lookup. **Every**
  caller resolving an id to a place goes through `resolveAnyPlace()`. A
  hand-written lookup chain elsewhere is how the company office shipped with a
  prompt that opened nothing.
- **`components/locations/interactionRegistry.jsx`** — the only file that knows
  what an interaction id *means*. Giving a building a behaviour is one string in
  its data.
- **Depth sorting** — everything sorts by world `y`. The player's depth is its
  `y`; a building's is its front edge. Any new drawn thing must follow this.
- **`InteriorScene`** — parameterised by `{key, room, objects, locationId}`. A
  new room is a data file and a six-line subclass.
- **The city has two renderers.** `CityRenderer` draws from shapes;
  `BackdropRenderer` shows a painted illustration with collision read from a
  mask image. `CITY_BACKDROP` in `world/backdrop.js` selects between them and is
  currently `null`. In painted mode `this.renderer` does not exist — anything
  outside `create()` must use `this.renderer?.`.

## 6. Data model, in one pass

- **Identity** — `profiles` (roles, active role), `candidate_profiles`,
  `organizations`, `organization_memberships`.
- **Marketplace** — `jobs`, `applications`, `application_events`, `saved_jobs`.
  The employer's pipeline and the candidate's list are two views of one table.
- **Progression** — `career_progress`, `career_events` (the ledger of record),
  `xp_ledger`, `career_stats`, `achievements`, `career_activity`.
- **Missions** — `missions`, `mission_objectives` (with `context_key` /
  `context_value` so four skill missions sharing one event name stay distinct),
  `mission_progress`.
- **Learning and assessment** — `courses`, `course_enrollments`, `interviews`,
  `interview_questions`, `interview_attempts`. Answer keys are never served.
- **Social** — `posts`, `post_likes`, `post_comments`, `connections` (ordered
  pair, unique either way round), `follows`, `referrals`, plus `post_reports`
  and `blocked_authors`.
- **Presence and messaging** — `presence` (one row per account, overwritten),
  `conversations` (ordered pair), `messages`, `conversation_reports`.
- **Notifications** — `notifications`, `notification_preferences`.

## 7. Multiplayer

**Presence** is a 15-second heartbeat through the router. There is no online
flag: online means `last_seen_at` is inside a 45-second window, so going offline
is the absence of a write rather than the presence of one. Nothing needs
cleaning up.

The privacy rule is the design: `presence_visibility` governs whether you are
**named**, not whether you are **counted**. Default `connections` means your
connections see your name and everyone else sees an anonymous body. `nobody` is
absent from rosters *and* counts — an occupancy that ticks 0→1 when an invisible
account walks in is a leak by arithmetic. Exclusions are applied **before**
anything is counted, in one predicate (`_shared/presence.ts`).

**Messaging** threads are keyed on the pair, so opening one twice finds it. A
thread records where the two met. The anti-spam rule is the **one-message
invite**: you may send exactly one message to someone you have no accepted
connection with, until they reply. Blocks cut both ways and a refusal never
says you were blocked.

## 8. Testing

There is **no test framework and no CI** — this is the largest known gap.
Verification is scripts:

- **`scripts/smoke-live-*.mjs`** — nine suites run against the deployed API with
  real accounts. They are the real tests; most rules here are about what a
  *second* person sees, which a mock cannot prove.
- **`scripts/audit-endpoints.mjs`** — cross-references every `apiClient` call
  against every registered route. Currently 97 routes, 104 calls, 98 matched,
  6 unmatched and all AI.
- **`scripts/cleanup-test-accounts.mjs`** — the suites create real accounts;
  this removes them. Safety is the domain: only RFC 2606 reserved domains are
  ever deletable.
- Pure logic (walk-mask decoding, band slicing, progression tables) is tested
  with throwaway Node harnesses.

Run before any commit: `npm run lint`, `npm run build`,
`deno check supabase/functions/api/index.ts`.

## 9. Current state

**Live** — every surface except AI: auth, onboarding, jobs, candidates,
applications, career progression, missions, organizations, notifications,
social, interviews, learning, leaderboard, presence, conversations.

**Mocked** — AI only (6 endpoints). Blocked on a provider decision; the team has
since chosen Google Gemini, which is not yet built.

**In flight** — a city redesign scoped to three routes, with the painted-city
pipeline built and switched off pending a decision. An eleven-item suggestion
list from the team covering street life, globalisation, a dual leaderboard, a
reminder scheduler and a games arcade.

## 10. Landmines

Every one of these actually happened.

**A mock passing proves nothing about a second person.** The progression mock
passed 57 checks while the real `apply_career_event` returned the original award
on replay — a "+100 XP" toast for XP nobody earned. Only the live suite caught
it. Mirror server rules in mocks so the UI is reachable, never to prove them.

**Cross-account leakage through stores.** Every store has a documented `reset`;
`signOut` does not reload the page, so a store missing from
`clearAccountStores()` carries one account's data into the next. This has
happened twice — most recently `usePlayerStore`, where `visitedLocationIds`
gated a discovery XP event and silently denied it to the next account.

**A second copy of a lookup.** `ModalRoot` kept its own chain of room lookups; a
fourth room was registered in `places.js` and not there, so a whole room's
furniture showed a prompt and opened nothing. Every visible signal said it
should work.

**Silent fallbacks.** A missing texture dropped the city to its other renderer
with no error, making a crash and a failed download look identical. If a path
degrades, say so in the console.

**Unmount cleanups that mutate shared state.** StrictMode runs a mounting
effect as effect → cleanup → effect, so a cleanup clearing store state runs
*during mount*. A chat panel closed itself the instant it opened. Components
may own their own timers in a cleanup; they may not own anybody else's state.

**Field names drifting from the column.** `toOrganization` returned `sizeBand`
because the column is `size_band`, while five screens read `organization.size`.
The API shape is the contract, not the schema.

**Opt-outs applied after the fact.** The leaderboard filtered the viewer's own
row and left them on everybody else's board. Exclusions belong before the
counting, not at the point of rendering.

## 11. Conventions

- Comments explain **why**, not what. Match the density already present.
- Error messages in `message` are shown to users verbatim — write them for a
  person. `code` is for branching.
- A notice is best-effort: `notify()` logs and swallows, because a failed bell
  must not fail the thing it was about.
- A report is a row for review, never an instant takedown. Blocking is the
  instant action and it belongs to the person affected.
- Commits are not pushed unless asked.
