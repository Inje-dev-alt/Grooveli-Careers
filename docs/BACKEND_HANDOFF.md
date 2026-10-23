# Grooveli Careers — Backend Handoff

**Audience:** the engineer building the Grooveli application API.
**Status of the frontend:** complete prototype across candidate, employer and
network. Every data path is mocked.
**What this document is:** exactly what the frontend asks for, in the shape it
expects.

The frontend owns no persistent business data. Everything below is the
backend's to own, store and serve. Where the prototype fakes something it is
marked **MOCKED** with the file that fakes it, so each endpoint can be switched
on independently.

---

## 1. How the frontend talks to the API

All HTTP goes through one module: `src/services/apiClient.js`. Nothing else in
the application calls `fetch`.

```js
import { apiClient, withMock } from './apiClient.js';

export function listJobs(query) {
  return withMock(
    async () => { /* mock */ },
    () => apiClient.get('/jobs', { params: query }),
  );
}
```

Every service function already contains the real call as its second branch.
Turning the backend on is:

1. Set `VITE_API_BASE_URL` to the API root.
2. Set `VITE_USE_MOCKS=false`.
3. Delete the mock branch of each service as its endpoint goes live.

No component changes. Components never call `fetch` and never import mock data —
both are enforceable with a grep and currently hold.

### Conventions

| Concern | Expectation |
| --- | --- |
| Content type | `application/json` both ways |
| Auth | `Authorization: Bearer <token>` on every authenticated request |
| Dates | ISO 8601 UTC (`2026-10-05T07:20:00.000Z`) |
| Money | Integer major units plus an ISO 4217 code (`salaryMin: 500000, currency: "NGN"`) |
| IDs | Opaque strings; the frontend never parses them |
| Casing | `camelCase` |
| Empty collections | `[]`, never `null` |

---

## 2. Identity

**LIVE on Supabase** (Edge Function `api`, Supabase Auth) since Phase 2 — still
**MOCKED** when `VITE_USE_MOCKS` is on, in `src/services/authService.js`.
Passwords were compared in the browser in the prototype; the live path never
does.

### The account model

One account holds both capabilities. This is the single most important
structural decision in the frontend, and the hardest to undo later:

```json
{
  "id": "usr-001",
  "email": "john.doe@example.com",
  "displayName": "John Doe",
  "roles": ["candidate"],
  "activeRole": "candidate",
  "createdAt": "2025-11-04T09:12:00.000Z",
  "candidateProfileId": "cp-001",
  "organizationMemberships": [
    {
      "organizationId": "org-northwind",
      "organizationName": "Northwind Systems",
      "role": "admin",
      "title": "Head of Talent",
      "joinedAt": "2025-09-18T10:40:00.000Z"
    }
  ]
}
```

`roles` is an array and `activeRole` selects the current experience. A recruiter
who is also job-hunting is **one user**, not two accounts. Please do not model
candidates and employers as separate account types.

### Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | `{ email, password }` → `{ token, user }`. The new user has `roles: []` |
| POST | `/auth/login` | `{ email, password }` → `{ token, user }` |
| POST | `/auth/logout` | 204 |
| GET | `/users/me` | → `User`. Restores a session from a stored token |
| POST | `/users/me/roles` | `{ role }` → `User`. **Adds** a capability, never replaces |
| PATCH | `/users/me` | `{ activeRole }` → `User`. Switches between held capabilities |
| POST | `/candidates` | Candidate onboarding payload → `User` with `candidateProfileId` set |
| POST | `/organizations` | Employer onboarding payload → `{ user, organization }` |

### Identity states the UI already renders

| State | Source | What the user sees |
| --- | --- | --- |
| `idle` | No token | Sign-in |
| `restoring` | Token present, `/users/me` in flight | Loader; protected routes wait rather than redirect |
| `authenticating` | Login or register in flight | Loading button |
| `authenticated` | Token + user | The product |
| `error` | Rejected | Inline message with retry |
| Signed in, `roles: []` | — | Role selection at `/welcome` |
| Candidate role, no `candidateProfileId` | — | `/onboarding/candidate` |
| Employer role, no memberships | — | `/onboarding/employer` |

A 401 or 403 arrives as an `ApiError` with `isAuthError === true`.

---

## 3. Error contract

```json
{
  "code": "validation_failed",
  "message": "Salary minimum cannot exceed salary maximum.",
  "details": { "field": "salaryMin" }
}
```

`message` is shown to the user verbatim, so write it for a person. `code` is for
branching; `details` is never rendered raw.

| Status | Frontend behaviour |
| --- | --- |
| 400 / 422 | Inline error, form values preserved |
| 401 / 403 | Session cleared, redirect to sign-in |
| 404 | Empty state |
| 409 | Treated as already-done where sensible (re-applying returns the existing application) |
| 429 | Error state with retry; please send `Retry-After` |
| 5xx | Error state with retry |
| Network failure | `ApiError` with `status: 0` |

---

## 4. Data models

These mirror `src/models/index.js`, which is the frontend's source of truth.

### 4.1 CandidateProfile

```json
{
  "id": "cp-001",
  "userId": "usr-001",
  "headline": "People Operations Specialist moving into HR technology",
  "summary": "Five years across recruitment and HR operations…",
  "location": "Lagos, Nigeria",
  "yearsExperience": 5,
  "careerGoal": "Move into a people systems role…",
  "careerInterests": ["People Operations", "HR Technology"],
  "careerPathId": "path-hr",
  "workTypes": ["hybrid", "remote"],
  "openTo": ["full-time", "contract"],
  "salaryExpectation": { "min": 450000, "max": 750000, "currency": "NGN" },
  "industries": ["Recruitment", "Technology"],
  "skills": [
    { "id": "skl-recruitment", "name": "Recruitment", "category": "people",
      "level": 90, "verified": true, "score": 93 }
  ],
  "experience": [
    { "id": "exp-1", "title": "People Operations Specialist",
      "organization": "Harbour & Co.", "startDate": "2023-02", "summary": "…" }
  ],
  "education": [
    { "id": "edu-1", "qualification": "BSc …", "institution": "…", "year": "2020" }
  ],
  "cv": { "hasCv": false, "fileName": null, "updatedAt": null },
  "completeness": 90
}
```

`completeness` (0–100) should be computed server-side. The frontend computes it
too (`candidateService.calculateCompleteness`) so the checklist updates
optimistically — **the two must agree**. Current weighting:

| Field | Weight | Satisfied when |
| --- | --- | --- |
| `headline` | 12 | non-empty |
| `summary` | 12 | longer than 40 characters |
| `location` | 8 | non-empty |
| `skills` | 18 | at least 5 |
| `experience` | 14 | at least 1 |
| `education` | 8 | at least 1 |
| `careerGoal` | 8 | non-empty |
| `salaryExpectation` | 8 | `min > 0` |
| `cv` | 12 | `hasCv` is true |

`verified` and `score` on a skill are the backend's to set, from an assessment.
A self-rated skill must never come back verified — the whole employer-side value
proposition rests on that distinction.

`gender` ∈ `female` | `male` | `non-binary` | `prefer-not-to-say`, optional and
private. It personalises the candidate's experience only — it must never be
returned on employer-facing reads, included in matching, or used in analytics.
`careerInterests` values come from the ten-row `career_paths` catalog (§4.6);
reject anything not in it.

`careerPathId` is the candidate's explicit home path — the `career_paths.id`
(§4.6) of the interest they picked first at onboarding. Nullable: profiles saved
before this field existed resolve by inference instead (first interest, then
held-skill overlap), and the backend must mirror that same inference when the
field is absent so both sides resolve identically.

### 4.2 Organization

```json
{
  "id": "org-northwind",
  "name": "Northwind Systems",
  "tagline": "Payments infrastructure for African commerce.",
  "description": "…",
  "industry": "Fintech",
  "size": "120-400",
  "location": "Lagos, Nigeria",
  "website": "https://example.com/northwind",
  "districtId": "technology-hub",
  "logoColor": "#6fe0ff",
  "followerCount": 4820,
  "verified": true,
  "createdAt": "2024-03-11T09:00:00.000Z"
}
```

`districtId` places the company in Grooveli City. Valid values are the location
ids in `src/game/world/locations.js`: `corporate-district`,
`recruitment-agency`, `university-campus`, `technology-hub`,
`creative-district`, `healthcare-district`, `hospitality-district`,
`finance-district`.

`logoColor` generates a monogram tile. No logo files are uploaded or served.

Membership roles: `owner`, `admin`, `recruiter`, `hiring-manager`. The MVP only
distinguishes "has a membership"; the permission model is yours to define.

### 4.3 Job — **the normalised shape**

```json
{
  "id": "job-001",
  "organizationId": "org-northwind",
  "companyName": "Northwind Systems",
  "title": "Backend Engineer",
  "description": "Own settlement services that move money between merchants and banks.",
  "salaryMin": 500000,
  "salaryMax": 800000,
  "currency": "NGN",
  "salaryPeriod": "month",
  "location": "Lagos / Remote",
  "workType": "remote",
  "employmentType": "full-time",
  "experienceLevel": "mid",
  "requiredSkills": ["Node.js", "NestJS", "PostgreSQL"],
  "preferredSkills": ["SQL"],
  "industry": "Fintech",
  "districtId": "technology-hub",
  "deadline": "2026-11-12T08:00:00.000Z",
  "status": "published",
  "source": "mock",
  "createdAt": "2026-09-28T08:00:00.000Z",
  "responsibilities": ["…"],
  "requirements": ["…"],
  "featured": true,
  "matchScore": 41,
  "matchReasons": ["Remote work matches your preference"],
  "skillGaps": ["Node.js", "NestJS"]
}
```

`companyName` is denormalised on purpose: job lists render many rows and should
not need a second request.

**`source`** ∈ `grooveli_employer` | `workpedia` | `partner` | `mock`. The
frontend never branches on it. It exists so the marketplace can mix
employer-created roles with partner feeds without any screen caring where a job
came from — this is the migration path from mock jobs to real ones.

**`status`** ∈ `draft` | `published` | `paused` | `closed`. Only `published`
roles are discoverable; the others belong to the employer who owns them. The
frontend filters on this, and the backend should too.

**`matchScore`, `matchReasons` and `skillGaps` are the matching service's output
and must be computed per requesting candidate.** `matchReasons` are rendered
verbatim, so write them as sentences a candidate can read. A job with no score
yet (one just published) should omit `matchScore` rather than send `0` — the UI
hides the badge when it is absent, and a fabricated zero would read as a real
judgement.

Other enums: `workType` ∈ `onsite` | `hybrid` | `remote`; `employmentType` ∈
`full-time` | `part-time` | `contract` | `internship` | `freelance`;
`experienceLevel` ∈ `entry` | `junior` | `mid` | `senior` | `lead`;
`salaryPeriod` ∈ `month` | `year`.

### 4.4 Application

```json
{
  "id": "app-001",
  "jobId": "job-019",
  "jobTitle": "Payroll Specialist",
  "organizationId": "org-harbour-co",
  "companyName": "Harbour & Co.",
  "candidateId": "usr-001",
  "status": "interview",
  "appliedAt": "2026-09-21T10:12:00.000Z",
  "updatedAt": "2026-10-03T14:00:00.000Z",
  "note": "First-stage call completed."
}
```

`status` ∈ `applied` | `under-review` | `shortlisted` | `interview` |
`assessment` | `offer` | `rejected` | `withdrawn` | `hired`. The MVP only moves
applications as far as `shortlisted` from the employer side, but every state is
named so no screen has to invent one.

### 4.5 Missions, XP and career progress

A mission objective names the **career event** that advances it:

```json
{
  "id": "obj-apply",
  "label": "Apply to three suitable jobs",
  "event": "application.suitable",
  "target": 3,
  "actionLabel": "Browse jobs",
  "actionRoute": "/jobs"
}
```

Missions can belong to a career path. A mission carrying `pathId` (a
`career_paths.id`, §4.6) is part of that path's chain and must only be served
to accounts whose resolved path matches — the backend filters `GET /missions`
by the caller's `careerPathId` (explicit first, inference second, §4.1).
Missions without `pathId` are core and serve everyone. One interview-and-apply
loop mission per path exists today (`msn-path-*`).

The event vocabulary is fixed, in `src/utils/careerEvents.js`:

| Event | Fired when |
| --- | --- |
| `profile.completed` | Completeness reaches 100 |
| `cv.uploaded` | A CV is attached |
| `assessment.completed` | The AI career assessment finishes |
| `job.viewed` / `job.saved` | A job is opened or saved |
| `application.suitable` | Applied to a role matching ≥ 60 |
| `application.unsuitable` | Applied below that threshold |
| `interview.simulated` | An interview simulation completes |
| `skill.challenge` | A skill mission is passed |
| `course.completed` | A course is completed |
| `mission.completed` | A mission's objectives are all met |
| `location.visited` | A district is entered for the first time |
| `ai.consulted` | A message is sent to Grooveli AI |
| `social.posted` / `social.connected` | A post is published / a connection made |

**XP table** (`careerActions`, already matching the product spec):

| Activity | XP |
| --- | --- |
| Complete profile | 50 |
| Upload CV | 25 |
| Career assessment | 75 |
| Skill challenge | 100 |
| Interview simulation | 100 |
| Application to a **suitable** role | 25 |
| Course completion | 200 |
| Mission completion | the mission's `xpReward` |
| Everything else | **0** |

**Three product rules the backend must enforce, not just the frontend:**

1. **Applications below the 60% match threshold earn nothing.** Volume is not
   career progress, and the system must not reward spam applications.
2. **One-off achievements count once** — profile, CV and assessment.
3. **Posting, connecting, viewing and saving are worth zero.** No amount of time
   spent in the product substitutes for career work.

**XP and reputation are separate numbers and must stay separate.** XP measures
progression. Reputation measures credibility and only moves on work someone else
could verify — a passed assessment, a completed course, a finished interview.
Current reputation deltas: skill challenge +3, course +5, assessment +2,
interview +2, profile completion +1. Reputation is 0–100.

Career level curve (`src/utils/progression.js`):

```
xpForLevel(n) = round(120 × 1.18^(n-1))
```

Level 1→2 costs 120 XP; level 10→11 about 534. **A new account starts at level 1
with 0 XP** — progression that was handed out rather than earned makes every
number downstream meaningless.

**`POST /career/events` - designed, and the single write everything funnels
through** (`recordCareerEvent` in `src/stores/progression.js`):

```json
{
  "event": "application.suitable",
  "occurredAt": "2026-10-06T09:00:00.000Z",
  "idempotencyKey": "evt-usr-001-application.suitable-job-002-1791286800",
  "context": { "jobId": "job-002" }
}
```

**The `idempotencyKey` is mandatory and unique per user.** Every screen that
can fire an event can double-fire it (double-clicks, retries, two tabs); the
server must treat a repeated key as already-done and return the original
result with `200`. Client-side guards exist and are not trusted.

**200**
```json
{
  "xpAwarded": 25,
  "reputationAwarded": 0,
  "totalXp": 1265,
  "level": 8,
  "levelledUp": false,
  "missionsAdvanced": [{ "missionId": "msn-first-job", "justCompleted": false }],
  "achievementsEarned": [{ "id": "ach-first-application", "name": "First Application" }]
}
```

With that endpoint the server owns the XP table, the one-off rule and the
anti-spam rule, and the frontend becomes a pure renderer of the response.

**Three tables behind it:**

- **`career_events`** - append-only: `(id, user_id, event, context jsonb,
  occurred_at, idempotency_key UNIQUE(user_id, idempotency_key))`. The one-off
  rule (profile, CV, assessment) becomes "one row per key", not a client
  array: the frontend's `one_time_events` mirror exists only until this lands.
- **`xp_ledger`** - `(id, user_id, career_event_id, amount, reason,
  created_at)`. The "why did I level up" history the HUD renders; totals
  without a ledger are numbers the player cannot defend.
- **`achievement_progress`** - `(user_id, achievement_id, count, awarded_at
  NULL)`. Achievements are **counted**, not fired: Career Explorer needs five
  `location.visited` rows and the Excel award needs `context.skill = "Excel"`.
  `count` and `context` live on the achievement definition.

### 4.6 Career paths

Ten rows, owned by the backend. Everything that talks about careers keys off
them — onboarding interests, Discovery matches, interview banks, districts.

`GET /career-paths` → the catalog; `GET /career-paths/:id` → one path.

```json
{
  "id": "path-hr",
  "title": "Human Resources",
  "districtId": "recruitment-agency",
  "tagline": "Hiring, people operations and the systems behind them.",
  "summary": "Run recruitment, own people operations, and build the processes…",
  "core": ["Recruitment", "HR Operations", "Communication"],
  "growth": ["Excel", "Data Analysis", "AI Automation"],
  "interviewBankId": "bank-hr"
}
```

**The ten launch titles are fixed** — Human Resources, Software Development,
AI Engineering, Social Media Management, Digital Marketing, Product Design,
Motion Design, Video Editing, Customer Support, Virtual Assistance. Add a path
by adding a row (plus a question bank); renaming a `title` renames it in
onboarding, Discovery and interviews at once, so treat titles as stable
identifiers. `core` reuses the skill vocabulary jobs speak, so matching needs
no translation layer. Candidates submit `careerInterests` as titles from this
list — reject anything not in it.

### 4.7 Interview attempts

A simulation is a real exam with a binary pass rule, enforced server-side:
**two correct answers pass, two wrong answers fail**, over up to four
questions from the candidate's path bank. An exam everyone passes certifies
nothing — only a pass fires `interview.simulated`, its XP and the Interview
Ready badge.

`POST /interviews/start` `{ pathId? , jobTitle? }` → `{ attempt, question,
questionNumber, total, rule }`. The question carries options but **never the
answer index or rationale** — what the candidate may see is the contract.

`POST /interviews/:id/answer` `{ questionId, optionIndex }` → `{ correct,
correctOptionIndex, rationale, correctCount, wrongCount, finished, passed,
score, questionNumber, nextQuestion, attempt }`. The rationale rides with the
grade because the point of a practice interview is the feedback, not the
score.

`GET /interviews/attempts` → this account's attempts, newest first.
`score` is correct ÷ answered as a percentage (2–0 is 100, 2–1 is 67).

**Table `interview_attempts`:** `(id, user_id, path_id, job_title,
question_ids jsonb, answers jsonb, correct_count, wrong_count, status,
passed, score, started_at, completed_at)`. `question_ids` is the drawn paper —
fixed at start so a retry cannot swap questions mid-exam.

### 4.8 Social

```json
{
  "id": "post-001",
  "author": { "id": "cand-001", "kind": "user", "name": "Adaeze Nwosu",
              "headline": "Talent Acquisition Specialist", "color": "#5be3c8", "verified": false },
  "type": "achievement",
  "body": "Finally finished the Recruitment Mission…",
  "attachment": { "kind": "achievement", "refId": "ach-excel-foundations",
                  "label": "Excel Foundations", "detail": "Assessment score",
                  "score": 91, "verified": true },
  "likeCount": 34,
  "likedByMe": false,
  "comments": [ { "id": "cmt-001", "postId": "post-001", "author": { … }, "body": "…", "createdAt": "…" } ],
  "createdAt": "2026-10-05T09:40:00.000Z"
}
```

`author.kind` ∈ `user` | `organization` — companies post too. `type` ∈
`achievement` | `skill` | `advice` | `insight` | `opportunity` |
`company-update`.

**Identity surfaces.** `avatarUrl` (User) and `logoUrl` (Organization) are
optional picture references with a generated-monogram fallback — the frontend
never requires a file to render. Uploads are `multipart/form-data` with a
`file` part:

- `POST /users/me/avatar` → the updated user with `avatarUrl` set, plus a
  signed URL if pictures are retrievable. Mocked in `socialService.js`
  (file name only — nothing leaves the browser, exactly like the CV).
- `POST /organizations/:id/logo` → the updated organization with `logoUrl`
  set. Mocked in `organizationService.js`.
- `GET /social/connections/count?userId=` → `{ count }` of accepted
  connections, either side of the row. The profile renders it as a
  "Connections" tile; the company renders `followerCount` as "Followers".

**Only achievements the candidate has actually earned may be attached**, and
`verified` must come from the backend. An attachable achievement that was not
earned would turn the feed from social proof into noise.

`body` is rendered as plain text with newlines preserved. **Do not send Markdown
or HTML** — the frontend does not parse either, by design.

Connections and follows are **separate relationships**: a user connects with
a user (mutual, with a `pending` state) and follows a user or an organization
(one-way). Keeping them apart now means the social graph does not need
rebuilding when either side grows.

**Referrals** (`social.referrals`): `{ id, referrerUserId, referrerName,
applicantUserId, applicationId, jobTitle, companyName, status ∈ requested |
sent | declined, createdAt }`. A referral is a connection vouching for a
candidate on a live application. It earns zero XP - a request is not work -
and the backend must rate-limit it like the consequential action it is.

**Moderation** ships with the feed or the feed does not ship:
`social.reports` (`{ id, postId, reporterUserId, authorId, reason, status ∈
open | reviewing | actioned | dismissed, createdAt }`) - rows for human
review, never instant takedowns - and per-user blocks
(`blocked_author_ids(user_id, author_id)`), which hide an author from that
account only.
### 4.9 AI

```json
{
  "id": "msg-1001",
  "role": "assistant",
  "content": "I looked at 22 open roles against your profile…",
  "actions": [{ "id": "act-open-jobs", "label": "Open these matches", "intent": "find-jobs" }],
  "references": { "jobIds": ["job-002"], "missionIds": [] },
  "createdAt": "…"
}
```

`actions[].intent` is **routed by the interface, not pasted into a prompt**.
Known intents: `find-jobs`, `improve-cv`, `prepare-interview`,
`find-skill-gaps`, `career-advice`, `assessment`, `interview-simulation`,
`general`.

`GET /ai/career/next-action` returns the single recommended next step:

```json
{
  "id": "next-skill-Data Analysis",
  "title": "Build your Data Analysis skill",
  "reason": "Data Analysis appears in 6 of the roles you are matching above 60%. It is the single gap blocking the most opportunities.",
  "xp": 100,
  "actionLabel": "Find a skill mission",
  "route": "/missions"
}
```

The `reason` is not decoration. A recommendation without one is a nag, and the
UI gives it as much space as the title.

`GET /ai/career/discovery` returns career paths with `matchScore`, `strengths`,
`gaps` and `summary`.

---

### 4.10 Evidence tables - skill assessments and course enrolments

**`skill_assessments`** - `(id, profile_id, skill_name, kind ∈ ai-assessment |
mission | course, ref_id, score, occurred_at)`. Every time a skill flips to
`verified`, this row is the reason why. Without it, `verified` is a claim
the platform makes about itself; with it, an employer can see which mission
or assessment produced the score and when. The frontend writes
`POST /candidates/me/skills/verify` and expects this row to appear.

**`course_enrollments`** - `(id, user_id, course_id, status ∈ enrolled |
completed, enrolled_at, completed_at, UNIQUE(user_id, course_id))`. A course
completes once. `POST /learning/courses/:id/complete` on an already-completed
enrolment returns `200` with `alreadyCompleted: true` and awards nothing -
the 200 XP and the certification increment are not repeatable.

---

## 5. Endpoints

**LIVE** on the Supabase `api` Edge Function: identity (`/auth/*`,
`/users/me`), jobs (`/jobs*`), candidates (`/candidates*`, own profile and
employer discovery), applications (`/jobs/:id/apply`, `/applications*`), career
progression (`/career/*`), missions (`/missions*`) and organizations
(`/organizations*`) — steps 1–8 below.

**MOCKED**: social, learning, interviews, leaderboard, notifications and AI.
"Mocked in" names the file to delete the branch from.

Progression is the one surface where the frontend was changed as well as
pointed at new endpoints, because the browser had been deciding what it earned.
That work is described under **Career** and **Missions** and in §7.

### Jobs
| Method | Path | Mocked in |
| --- | --- | --- |
| GET | `/jobs` (list, search, filters) | `jobService.js` |
| GET | `/jobs/:id` | `jobService.js` |
| GET | `/jobs/recommended?limit=` | `jobService.js` |
| GET | `/jobs/facets` (industries, skills) | `jobService.js` |
| GET / POST / DELETE | `/jobs/saved`, `/jobs/:id/save` | `jobService.js` |
| PATCH | `/jobs/:id` (status) | `organizationService.js` |
| POST | `/jobs/:id/apply` | `applicationService.js` |

`GET /jobs` query parameters, sent exactly as the filter UI produces them:
`search`, `districtId`, `location`, `industry`, `employmentTypes[]`,
`workTypes[]`, `experienceLevels[]`, `skills[]`, `minSalary`, `minMatch`,
`sort` (`match` | `recent` | `salary`). Repeated parameters are serialised one
key per value. Pagination is not used yet; when the catalogue grows return
`{ items, total, nextCursor }` and the list will take a cursor.

**`POST /jobs/:id/apply` must be idempotent per candidate+job.**

Every candidate-facing read (`GET /jobs`, `GET /jobs/:id`,
`GET /jobs/recommended`) computes `matchScore`/`matchReasons`/`skillGaps`
for the requesting candidate. The frontend mirror is
`src/services/matchingService.js` - a pure (job, profile) function - which
also feeds the AI briefing and the 60% suitability threshold. A job the
profile says nothing about returns no score, not a zero.

### Applications (candidate side)
| Method | Path | Mocked in |
| --- | --- | --- |
| GET | `/applications` (the candidate's own rows) | `applicationService.js` |
| POST | `/jobs/:id/apply` | `applicationService.js` |
| PATCH | `/applications/:id` (withdraw) | `applicationService.js` |
| POST | `/applications/:id/respond` (`{ decision: accept | decline }`) | `applicationService.js` |
| POST | `/applications/:id/acknowledge` (rejection seen) | `applicationService.js` |
| GET | `/applications/:id/events` (stage history) | `applicationService.js` |
| GET | `/interviews`, `POST /interviews/simulations` | `applicationService.js` |

Accepting an offer moves the application to `hired` and the backend should
also append an experience entry to the candidate profile - the role joins
the career story at the moment it is signed.

### Career paths and interviews
| Method | Path | Mocked in |
| --- | --- | --- |
| GET | `/career-paths`, `/career-paths/:id` (the ten-row catalog) | `data/careerPaths.js` (static mirror) |
| POST | `/interviews/start` (`{ pathId?, jobTitle? }`) | `interviewService.js` |
| POST | `/interviews/:id/answer` (`{ questionId, optionIndex }`) | `interviewService.js` |
| GET | `/interviews/attempts` (this account, newest first) | `interviewService.js` |
| GET | `/interviews/pass-rate` (profile surface) | `interviewService.js` |

Questions are served without answer indexes or rationales; the rationale rides
with the grade. The first-to-2 pass rule is enforced server-side (§4.7).
### Candidates
| Method | Path | Mocked in |
| --- | --- | --- |
| GET / PATCH | `/candidates/me` | `candidateService.js` |
| POST | `/candidates/me/cv` | `candidateService.js` |
| POST | `/candidates/me/skills/verify` | `candidateService.js` |
| POST | `/candidates/me/experience` | `candidateService.js` |
| GET | `/candidates` (employer discovery) | `candidateService.js` |
| GET | `/candidates/:id` | `candidateService.js` |

**CV upload needs a decision.** The prototype records a file name only; nothing
is uploaded and the file never leaves the browser. The real endpoint should take
`multipart/form-data` with a `file` part and return the updated profile with
`cv.hasCv`, `cv.fileName` and `cv.updatedAt` set, plus a signed download URL if
candidates should be able to retrieve it.

### Organizations — **LIVE** (Batch 3.4)
| Method | Path | Status |
| --- | --- | --- |
| GET | `/organizations`, `/organizations/:id` | Live — public |
| GET | `/organizations/active` | Live — `null` for a non-member |
| PATCH | `/organizations/:id` | Live — membership required |
| GET / POST | `/organizations/:id/jobs` | Live — membership required |
| GET | `/organizations/:id/applications` | Live — membership required |
| GET | `/organizations/:id/overview` | Live — membership required |
| GET | `/organizations/:id/analytics` | Live — membership required |
| POST | `/organizations/:id/logo` | Live — file name only, see below |
| PATCH | `/jobs/:id` (status) | Live — membership resolved from the job |
| PATCH | `/applications/:id` (status) | Live — see **two authorities** below |
| GET | `/candidates`, `/candidates/:id` | Live — employers only |

**Membership is now enforced.** Every write, and every read of an
organization's private data, resolves `organization_memberships` first. The
prototype took `organizationId` from the browser and trusted it, so publishing
a job into another company, or reading and moving its pipeline, was a matter of
editing one string in a request. A non-member gets 403; a company that does not
exist gets 404.

Permission *levels* are deliberately **not** enforced. `role` is stored and
returned (`owner` | `admin` | `recruiter` | `hiring-manager`) so the UI can show
it, but every member may take every employer action. Organization permission
enforcement stays out of scope (§10), and a half-built permission model reads as
a guarantee while being none.

**`PATCH /applications/:id` has two authorities on one path**, because the same
row means different things to the two sides of the marketplace:

| Caller | May set |
| --- | --- |
| the candidate who applied | `withdrawn`, and nothing else |
| a member of the hiring organization | `under-review`, `shortlisted`, `interview`, `assessment`, `offer`, `rejected` |
| anyone else | **404**, never 403 |

`applied` is how a row begins. `declined` and `hired` are reached through
`POST /applications/:id/respond`: an employer who could set `hired` directly
would be recording somebody else's decision. The 404 for a stranger is the §3
rule — a 403 would confirm both that the application exists and that somebody
is in that pipeline.

**A rejection requires `feedback`.** Blank or whitespace is a 400 naming the
field. The mock used to substitute canned text when the employer left it empty,
which made the prototype more permissive than production and put words in an
employer's mouth; both now refuse, and `EmployerCandidates` disables the button
until a reason is written.

**A published role is a `jobs` row like any other** — `source:
"grooveli_employer"`, immediately visible to `GET /jobs`. `industry` and
`districtId` come from the organization rather than the draft, as the mock did:
a role belongs to its company's district, and letting the form choose would put
a company's jobs somewhere its own profile contradicts.

`GET /organizations/:id/analytics` returns `{ applications, byStage,
avgDaysInStage, sourceMix, matchBuckets }`, computed from the organization's own
rows — no sample data. `matchBuckets` uses fixed boundaries `0-39 | 40-59 |
60-79 | 80-100 | unscored`, where `unscored` is an applicant with no resolvable
card: a candidate whose profile says nothing is an unknown match, not a bad one,
and folding them into `0-39` would invent a judgement. An empty pipeline returns
zeros and the panel renders honest empty states.

**`POST /organizations/:id/logo` stores a file name only**, and nothing is
uploaded — the same open decision as the CV above. The column `logo_url` exists
so the endpoint is not implying it stored something. Every screen renders
`logoColor` today; this is for when there is a real mark.

> **Divergence while notifications are mocked.** The mock writes an in-app
> notification on every stage change; the server writes the
> `application_events` row (which is the durable history the candidate's
> timeline reads) but **no notification**, because there is no notifications
> table until step 12. With `VITE_USE_MOCKS=false` a candidate therefore sees
> the new stage and its feedback on their applications list, but gets no notice
> drawing them to it. Wiring it is part of that batch.

#### The employer's view of a candidate

`GET /candidates`, `GET /candidates/:id` and the `candidate` attached to each
inbound application all serve one shape, built in `_shared/candidates.ts`:
`{ id, name, headline, location, careerLevel, reputation, color, skills,
experience, achievements, activity, openTo, workTypes, matchScore }`.

It is deliberately **not** the candidate's own profile. No summary, salary
expectation, education, CV, contact details or career goal. An employer
discovering talent sees evidence of work and nothing a candidate did not put
forward as evidence.

`matchScore` here is `reputation + min(20, careerLevel)` — a ranking of proven
strength, and **not** the candidate-facing job match score, which is a
`(job, profile)` function and means something else entirely. Two different
numbers have shared this name since the prototype; they are still two numbers.

Discovery requires organization membership. In the prototype it was open to
anyone signed in, so a candidate could list every other candidate. Membership is
the honest test of "is an employer": `activeRole` is a preference the account
sets for itself, so it decides which experience to render, never what may be
read. An account with no candidate profile is absent from discovery rather than
rendered as an empty card.

`GET /organizations/:id/analytics` returns `{ applications, byStage,
avgDaysInStage, sourceMix, matchBuckets }`, computed from the organization's
real application and job rows — no sample data. `byStage` counts per
application status; `avgDaysInStage` averages days since `stageEnteredAt`
(`updatedAt` fallback); `sourceMix` counts published roles by job `source`;
`matchBuckets` distributes applicants across fixed boundaries `0-39 | 40-59 |
60-79 | 80-100 | unscored` (unscored = no resolvable profile score). An empty
pipeline returns zeros and the panel renders honest empty states.

### Career — **LIVE** (Batch 3.1)
| Method | Path | Status |
| --- | --- | --- |
| GET | `/career/progress` | Live |
| GET | `/career/stats` | Live |
| GET | `/career/achievements` | Live |
| GET | `/career/activity?limit=` | Live |
| GET | `/career/ledger` | Live |
| GET | `/career/one-time-events` | Live |
| POST | `/career/events` | Live — the only progression write |

**Six writes were removed, not migrated.** `PUT /career/progress`,
`POST /career/ledger`, `POST /career/stats/increment`,
`POST /career/achievements/evaluate`, `POST /career/one-time-events` and
`POST /career/activity` each accepted a number from the browser, so a console
could award itself any level and the ledger would corroborate it. They answer
**410 `endpoint_retired`** with `details.replacedBy`, deliberately not 404,
which would read as "not built yet".

`POST /career/events` takes `{ event, context }` and nothing else. It replies
with `status` (`applied` | `replayed` | `already_counted`), `xpAwarded`,
`reputationAwarded`, `progress`, `stats` and `awardedAchievements` — everything
a caller needs, so no screen makes a second request to find out what happened.

**`context` is mandatory, and it is the anti-farming mechanism.** Each event is
keyed on the thing it is *about*, so the unique index enforces one award per
application, per course, per skill, per district rather than one per click. The
field per event is `NATURAL_KEY` in `routes/career.ts`, mirrored as
`EVENT_CONTEXT_KEY` in `src/utils/careerEvents.js`. An XP-bearing event that
arrives without its field is a **400** naming the field — without that guard the
key falls back to a fresh UUID and the award repeats on every request.

`mission.completed` is refused here (400, `replacedBy`): a mission's reward is a
property of its row, so it is paid by the mission endpoint, which checks the
objectives first. Both paths derive the same key, so firing it twice awards once.

### Missions — **LIVE** (Batch 3.2)
| Method | Path | Status |
| --- | --- | --- |
| GET | `/missions`, `/missions/:id` | Live |
| GET / PUT | `/missions/progress` | Live |
| POST | `/missions/:id/complete` | Live |
| POST | `/missions/:id/reminded` | Live |
| POST | `/missions/:id/attempt` | **MOCKED** — `missionService.js`, needs the AI service |

Three levels of trust, and the split is the point. The **catalog** is
authoritative and owns `xp_reward`. **Progress** is advisory: written from the
browser so part-finished objectives survive a reload, clamped to real targets,
and `completed` cannot be asserted through it. **Completion** is re-derived —
`POST /missions/:id/complete` recounts every objective against the account's own
`career_events` rows and answers **409** with `details.outstanding` if the work
was not done. The reply carries `progress`, the same shape `/career/events`
returns, so the client sets totals from it rather than doing arithmetic.

#### An objective can name *which* event satisfies it

`mission_objectives` carries a nullable `context_key`/`context_value` pair,
shaped and matched exactly like the one on `achievements`:

```json
{ "id": "obj-excel-challenge", "label": "Complete the Excel challenge",
  "event": "skill.challenge", "target": 1,
  "context": { "key": "skill", "value": "Excel" } }
```

Completion counts **per objective, not per event name**. An objective with a
key counts only events whose recorded `context` matches it; a null key counts
every event of that type, which is what a deliberately generic objective asks
for ("Pass a skill mission", "Apply to three suitable jobs").

This exists because four skill missions each ask for `skill.challenge` × 1 and
nothing named the skill, so one passed challenge satisfied all four and paid
400 XP. The live smoke test claimed 4 of 4 from 2 challenges. The *achievement*
for Excel was always correct because `achievements` already had these columns;
the mission was not because `mission_objectives` did not.

**One known gap, deliberately left open.** The ten `msn-path-*` interview
objectives each name a career path ("Complete a Human Resources interview
simulation") and share `interview.simulated` the same way, and are **not**
keyed. Keying them would bind `/interviews/*`, which does not exist yet, so:

> **Contract for whoever builds `/interviews/*` (step 11).** A passed
> simulation must record `interview.simulated` with `context.pathId` set to the
> candidate's **explicit** `candidate_profiles.career_path_id` — the same value
> that gates which path missions the account is served, not a path inferred
> from interests or skills, and not a path the client nominated. Once that
> holds, key the ten objectives on `pathId` and the gap closes. Keying them
> before it holds makes ten objectives quietly impossible, which is a worse
> failure than the one being fixed.

The exposure meanwhile is small: an account is only served a path's mission if
it is already on that path, so the most that can be gained is satisfying your
own path's interview objective with a simulation nominated for another, which
the interface offers no way to do.

`scripts/verify-missions-seed.mjs` prints every event shared by objectives that
are not all discriminated, so a new ambiguity shows up as a line in its output
rather than as XP nobody earned.

`POST /missions/:id/attempt` is the one gap: grading a skill challenge is the AI
service's job (§6), and a stub that invented a score would be worse than a 404.

### Learning
| Method | Path | Mocked in |
| --- | --- | --- |
| GET | `/learning/courses`, `POST /learning/courses/:id/complete` | `learningService.js` |
| GET | `/learning/enrollments`, `POST /learning/courses/:id/enrol` | `learningService.js` |
| GET | `/users/me/notification-preferences`, `PUT /users/me/notification-preferences` | `missionService.js` |

Reminder preferences are `{ missionReminders: boolean, quietHours: { start,
end } | null }` in 24h hours, per account. A mission is due when it is
`active`, unreminded for 24h (`lastRemindedAt` on the progress row), and
outside quiet hours. The mock evaluates this on page load and writes in-app
notices; the backend runs the same rule on a scheduler and writes
`POST /notifications` rows with `type: 'mission-reminder'`. Auth (email
sign-up, session token) already exists — reminders build on it.

### Social
| Method | Path | Mocked in |
| --- | --- | --- |
| GET | POST | `/social/posts` | `socialService.js` |
| POST | `/social/posts/:id/like`, `/social/posts/:id/comments` | `socialService.js` |
| GET | `/social/connections`, `/social/connections/suggestions`, `POST /social/connections` | `socialService.js` |
| GET | POST | `/social/follows` | `socialService.js` |
| GET | POST | `/social/referrals` | `socialService.js` |
| POST | `/social/posts/:id/report` | `socialService.js` |
| POST | `/social/blocks` | `socialService.js` |
### AI
| Method | Path | Mocked in |
| --- | --- | --- |
| GET | `/ai/briefing` | `aiService.js` |
| POST | `/ai/chat` | `aiService.js` |
| GET | `/ai/career/next-action`, `/ai/career/discovery` | `aiService.js` |
| POST | `/ai/assessment`, `/ai/interview-simulation` | `aiService.js` |

### Notifications
`GET /notifications`, `POST /notifications/:id/read`,
`POST /notifications/read-all` - `notificationService.js`. Rows carry a
`userId`; reads are scoped to the signed-in account. The pipeline writes
notices here on every stage change (review, shortlist, interview, offer,
rejection).

### Leaderboard
| Method | Path | Mocked in |
| --- | --- | --- |
| GET | `/leaderboard` | `leaderboardService.js` |
| GET / POST | `/leaderboard/opt-out` | `leaderboardService.js` |

Ranked by reputation, never XP. Opt-out is respected server-side: an opted
out account must not appear in the response, for anyone.
---

## 6. AI requirements

**The hard rule: no model provider is called from the browser, and no provider
key ever reaches this bundle.** Every Vite variable prefixed `VITE_` is inlined
into the public JavaScript. `src/services/aiService.js` states this at the top of
the file; please keep it true.

The backend owns provider credentials, the system prompt, the agent's tool
surface, rate limiting, conversation persistence, and retrieval scoped to the
requesting candidate only.

Behaviour the frontend is built around:

- **Grounded replies.** The briefing and the replies cite real counts and real
  roles. The mock does this from live data; the real agent must too, or the
  interface will look like it is lying.
- **Routed actions.** Map an intent to a tool call; do not re-parse the label.
- **Confirmation before consequential actions.** The agent must never submit an
  application as a side effect of a chat turn. The UI already confirms first.
- **Streaming optional.** The typing indicator exists. If you stream, use SSE on
  `POST /ai/chat` with `{ delta }` frames and a final `AIMessage`.

---

## 7. What the frontend persists today, and why it must stop

| Data | Where | Why temporary |
| --- | --- | --- |
| Whole mock dataset | `localStorage` key `grooveli:mock-db` | `src/services/mockDb.js` is the backend stand-in. Delete the file with the API |
| Auth token | `localStorage` key `grooveli:auth-token` | Fine to keep, or move to an httpOnly cookie |

`mockDb.js` snapshots itself so a registered account and a published job survive
a reload — otherwise the prototype cannot be demonstrated in one sitting. The
snapshot is written by an observer registered on `withMock`, so no service has
to remember to save.

As of Phase 2 the live surfaces (identity, jobs, candidates, applications,
career, missions) no longer read `grooveli:mock-db` when mocks are off; every
not-yet-migrated surface still does, so the snapshot stays until the last step
of §11.

### What the browser no longer decides (Batch 3.3)

Progression used to be computed client-side and reported upward. `careerStore`
held the XP table, added the reward to its own total, wrote the ledger row and
sent the result to `PUT /career/progress`; `missionStore` read `xpReward` out of
the mission catalog it had been served and paid it. The server wrote down
whatever it was told, so a console could mint a career level and every number
downstream — the badge, the ledger, the leaderboard — would agree with it.

There is now no code path in the browser that increases XP. `careerStore.absorb`
is the single place progression changes, and it only ever copies the totals out
of a server reply. Three things follow that are worth knowing when reading the
frontend:

- **`recordCareerEvent` is async** and awaits the event before advancing
  missions, because completion is re-derived from recorded events — a mission
  asked for before its event has landed is refused. A toast therefore waits for
  the round trip. That is deliberate: XP is a credential, and an optimistic
  figure that gets corrected means sometimes showing one that was never earned.
- **Zero-XP events moved from the ledger to the activity stream.** The browser
  used to force a ledger row with `ledger: true` for things worth nothing that
  the candidate still needs to see — an application below the match range, a
  rejection, a declined offer. `apply_career_event` writes a ledger row only for
  a non-zero award and an activity row for every event, so those now appear in
  career activity. The ledger stays an answer to "why did my level move" rather
  than a click log.
- **One known cosmetic divergence.** A ledger row shows the screen's contextual
  label for the rest of the session ("Applied for Senior Developer") but the
  server stores the generic `EVENT_LABELS[event]`, so after a reload it reads
  "Applied to a suitable role". Closing it means either accepting a display
  string from the browser into a record of awards, or resolving the label from
  the event's stored `context` server-side. The second is the better fix if the
  ledger is ever shown to anyone but the candidate.

`src/utils/careerEvents.js` still holds copies of the XP, reputation, one-shot,
statistic and context-key tables. They are a **mirror**, kept so the interface
can explain an award before it happens and so the mock can stand in for the
server — not an authority. The server's copies are in
`supabase/functions/api/_shared/progression.ts` and the two must not drift.

---

## 8. UI states the API must make possible

Every list and panel renders four states, from components in
`src/components/ui/StateViews.jsx`.

**Loading.** Skeletons for lists, spinner for single records. Mock latency is
deliberately non-zero (`VITE_MOCK_LATENCY`, default 360 ms) so these stay honest.

**Empty.** Distinguished from error. An empty list is `200` with `[]`, never
`404` and never `null`. Each empty state is written for its context: "No roles
match that", "No applications yet", "No roles published yet", "Nothing here yet"
for the feed, "No candidates match that".

**Error.** Rendered from `ApiError.message` with a retry that re-runs the same
request — which is why `message` must be user-facing prose.

**Authenticated / unauthenticated / mid-onboarding.** Covered in §2.

---

## 9. Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | empty | API root. Empty keeps mocks on |
| `VITE_USE_MOCKS` | `true` | `false` routes services at the real API |
| `VITE_MOCK_LATENCY` | `360` | Artificial latency for mock calls, ms |

**Nothing secret belongs in any of them.** No AI keys, no database credentials,
no auth secrets, no private tokens.

---

## 10. Out of scope for this frontend

Documented where cheap to pin down, but no interface consumes them yet:
employer billing and subscriptions, real-time messaging, multiplayer, the
recruiter AI, interview scheduling, external job ingestion, notification
delivery channels (email/push), and organization permission enforcement.

Referrals, post moderation (report + block) and the opt-in leaderboard are
no longer out of scope - they have contracts above and interfaces in the
prototype. Messaging stays out deliberately: a feed plus referrals covers
the hypothesis without becoming an inbox the team has to moderate.
## 11. Suggested order of integration

**Status, Phase 2 (cloud-first, Supabase):** steps 1–4 are **live** — 8
migrations and the `api` Edge Function router (`supabase/functions/api/`)
implement identity, jobs (with the §4.3 matching port), candidates and
applications against Postgres, verified end to end. Mocks remain the repo
default; flip `VITE_USE_MOCKS=false` with `VITE_API_BASE_URL` pointed at
`https://<ref>.supabase.co/functions/v1/api`. Known gaps until later phases:
the mock/partner application pipeline simulation is browser-side only (real
rows do not auto-advance), and employer, missions, social and `/ai/*`
endpoints do not exist yet — those screens stay on mocks.

Each step is independently shippable; the UI keeps working with the rest mocked.

1. `/auth/*` and `/users/me` — everything needs an identity. **Live.**
2. `GET /jobs`, `GET /jobs/:id` — the largest surface, easiest to verify. **Live.**
3. `/candidates/me` and CV upload. **Live.**
4. `POST /jobs/:id/apply`, `GET /applications`. **Live.**
5. `/career/*` — XP stops being browser-local. **Live.**
6. `GET /missions` and mission progress. **Live.**
7. Frontend progression refactor — no new endpoints. **Done** (§7).
8. `/organizations/*` + candidate discovery — employer side becomes real, and
   `source: "grooveli_employer"` jobs start flowing into the same marketplace.
   **Live.**
9. `/social/*`. **Batch 3.5.**
10. `/learning/*`. **Batch 3.6.**
11. `/interviews/*`. **Batch 3.7.**
12. `/leaderboard/*` and `/notifications/*`. **Batch 3.8.**
13. `/ai/*` — blocked on an AI provider key. **Batch 3.9.**

**Why the order changed from the original 1–8.** Three things the prototype
grew were missing from this list and existed only as mocked service calls:
`learningService` (4 calls), `interviewService` plus the two interview calls in
`applicationService` (6), and `leaderboardService` + `notificationService` (6).
That is ~14 endpoints and 3–4 tables of work, now steps 10–12.

Career progression moved ahead of the employer side because of a failure mode
rather than a preference. `careerStore.hydrate()` swallowed its fetch error in a
`catch {}`, so with `VITE_USE_MOCKS=false` and no `/career/*` routes a signed-in
user saw level 0, 0 XP and XP that silently vanished on reload — no error
message anywhere. Silent data loss costs more trust than a visible outage, so
steps 5–7 were the gate before any real cohort, candidate-only included. They
are done: the store now records the failure in `error` instead of swallowing it,
and there is a live endpoint behind every progression read.

Steps 1–7 are what make a candidate-only launch defensible, with social,
learning, leaderboard and interviews labelled "coming soon" rather than failing
quietly. Step 8 made the marketplace two-sided: an employer can onboard, publish
a role, and see real applications arrive against it.

**What now gates a launch is step 12, notifications.** The pipeline moves and
records itself, but nothing tells the candidate it moved — see the divergence
note under Organizations. Everything else outstanding is a feature labelled
"coming soon"; this one is a product that quietly stops talking to the person
waiting on it.

# Batch 2 — Employer HQ, analytics and reminders (continuation)

**Where this batch landed:**

| Area | Frontend surface | Backend endpoint (contract) |
| --- | --- | --- |
| Company HQ scene | `GameCanvas scene="company"` + `InteriorScene` subclass — desk / hiring board / candidate wall / brand shelf / door. | `GET /organizations/:id/jobs`, `GET /organizations/:id/applications` |
| Company profile page | `/employer/company` — edit name/tagline/industry/size/location/website + logo upload + network posts |
| Hiring analytics | `HiringAnalytics` panel (dashboard + `company-analytics` modal) — stage mix, avg time in stage, source mix, match buckets |
| Mission reminders | `MissionReminders` panel on `/missions` — preference save/load, quiet hours, on-load due-rule stamp |
| Notification preferences | `GET /users/me/notification-preferences`, `PUT /users/me/notification-preferences` |
| Connection count | `GET /social/connections/count?userId=` |
| Logo upload | `POST /organizations/:id/logo` — `multipart` with `file` part in prod, file name only in the prototype |
| Match buckets (fixed, shared with the backend): `0-39 | 40-59 | 60-79 | 80-100 | unscored`. A candidate with no resolved profile lands in `unscored`.
| Reminder rule (the same rule the backend scheduler will run): an active mission not reminded in the last 24h, outside the configured quiet window, and `missionReminders === true` produces a `type: "mission-reminder"` notification row plus a `lastRemindedAt` stamp on the progress row. Quiet hours are 24h windows, so overnight (e.g. `22:00 – 07:00`) is supported.
| MOCKED where not yet live:
| - `GET /organizations/:id/analytics`
| - `GET /organizations/:id/overview`
| - `GET /users/me/notification-preferences`
| - `PUT /users/me/notification-preferences`
| - `POST /organizations/:id/logo`
| - `POST /missions/:id/reminded`

Each service in `src/services/*.js` already carries the real `apiClient` call as its second branch, so enabling the backend only requires flipping the mock/archive flag — no component changes.

