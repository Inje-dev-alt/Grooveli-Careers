# Grooveli Careers — Backend Handoff

**Audience:** the engineer building the Grooveli application API.
**Status of the frontend:** complete prototype, every data path mocked.
**What this document is:** exactly what the frontend asks for, in the shape it expects.

The frontend owns no persistent business data. Everything below is the backend's
to own, store and serve. Where the prototype currently fakes something, it is
marked **MOCKED** and the file that fakes it is named, so each endpoint can be
turned on independently.

---

## 1. How the frontend talks to the API

All HTTP goes through one module: `src/services/apiClient.js`. Nothing else in
the application calls `fetch`.

```js
import { apiClient, withMock } from './apiClient.js';

export function listJobs(query) {
  return withMock(
    () => /* mock implementation */,
    () => apiClient.get('/jobs', { params: query }),
  );
}
```

Every service function already contains the real call as its second branch.
Turning the backend on is:

1. Set `VITE_API_BASE_URL` to the API root.
2. Set `VITE_USE_MOCKS=false`.
3. Delete the mock branch of each service as the matching endpoint goes live.

No component changes. Components never import mock data and never call
`fetch`; they call services.

### Conventions

| Concern | Expectation |
| --- | --- |
| Content type | `application/json` on request and response |
| Auth | `Authorization: Bearer <token>` on every authenticated request |
| Dates | ISO 8601 UTC strings (`2026-10-05T07:20:00.000Z`) |
| Money | Integer minor-unit-free amounts plus an ISO currency code (`{ min: 500000, max: 800000, currency: "NGN", period: "month" }`) |
| IDs | Opaque strings. The frontend never parses them |
| Casing | `camelCase` keys |
| Empty collections | `[]`, never `null` |
| Unknown optional fields | Omit, or `null`. The UI guards both |

---

## 2. Authentication

**MOCKED** in `src/services/authService.js`. The prototype signs in a demo
candidate with no credentials.

### `POST /auth/login`

```json
{ "email": "john.doe@example.com", "password": "…" }
```

**200**
```json
{
  "token": "eyJhbGciOi…",
  "refreshToken": "…",
  "expiresIn": 3600,
  "user": { "…": "User object, section 4.1" }
}
```

### `POST /auth/logout`
**204**, and the token is invalidated server-side. The frontend clears its copy
regardless of the response.

### `GET /users/me`
**200** → `User`. Called on load to restore a session from a stored token.

### `POST /auth/refresh`
Not yet called by the frontend. When it exists, `apiClient` will retry a single
401 through it before surfacing an auth error.

### Authentication states the UI already renders

| State | Where it comes from | What the user sees |
| --- | --- | --- |
| `idle` | No token | The entry screen |
| `authenticating` | Login in flight | Loading button, inputs disabled |
| `authenticated` | Token + user present | The product |
| `error` | Login rejected | Inline error with a retry |
| Expired mid-session | Any 401 on a later call | Redirect to the entry screen |

A 401 or 403 arrives as an `ApiError` with `isAuthError === true`.

---

## 3. Error contract

Every non-2xx response should carry:

```json
{
  "code": "validation_failed",
  "message": "Salary minimum cannot exceed salary maximum.",
  "details": { "field": "salaryExpectation.min" }
}
```

`message` is shown to the user verbatim, so write it for a person, not a log.
`code` is for branching; `details` is optional and never rendered raw.

| Status | Frontend behaviour |
| --- | --- |
| 400 / 422 | Inline error on the form, values preserved |
| 401 / 403 | Session cleared, redirect to entry |
| 404 | Empty state ("that role is no longer listed") |
| 409 | Treated as already-done where it makes sense (re-applying returns the existing application) |
| 429 | Error state with a retry; please include `Retry-After` |
| 5xx | Error state with a retry |
| Network failure | `ApiError` with `status: 0`, "could not reach Grooveli" |

---

## 4. Data models

These mirror `src/models/index.js`, which is the frontend's source of truth.

### 4.1 User

```json
{
  "id": "usr-001",
  "email": "john.doe@example.com",
  "displayName": "John Doe",
  "role": "candidate",
  "avatarUrl": null,
  "createdAt": "2025-11-04T09:12:00.000Z",
  "onboardingComplete": false
}
```

`role` ∈ `candidate` | `employer` | `admin`. Only `candidate` is implemented in
this frontend; the employer experience described in the PRD is a separate build.

### 4.2 CandidateProfile

```json
{
  "id": "cp-001",
  "userId": "usr-001",
  "headline": "People Operations Specialist moving into HR technology",
  "summary": "Five years across recruitment and HR operations…",
  "location": "Lagos, Nigeria",
  "yearsExperience": 5,
  "workModes": ["hybrid", "remote"],
  "openTo": ["full-time", "contract"],
  "salaryExpectation": { "min": 450000, "max": 750000, "currency": "NGN" },
  "industries": ["Recruitment", "Technology"],
  "cv": { "hasCv": false, "fileName": null, "updatedAt": null },
  "completeness": 62,
  "skills": [
    { "id": "skl-recruitment", "name": "Recruitment", "category": "people", "level": 90, "verified": true }
  ]
}
```

`completeness` (0–100) should be computed server-side. The frontend computes it
too (`profileService.calculateCompleteness`) so the checklist can update
optimistically — the two must agree. The weighting currently used:

| Field | Weight | Satisfied when |
| --- | --- | --- |
| `headline` | 15 | non-empty |
| `summary` | 15 | longer than 40 characters |
| `location` | 10 | non-empty |
| `skills` | 20 | at least 5 |
| `industries` | 10 | at least 1 |
| `salaryExpectation` | 10 | `min > 0` |
| `openTo` | 10 | at least 1 |
| `cv` | 10 | `hasCv` is true |

### 4.3 Company

```json
{
  "id": "cmp-northwind",
  "name": "Northwind Systems",
  "tagline": "Payments infrastructure for African commerce.",
  "description": "…",
  "industry": "Fintech",
  "size": "120-400",
  "location": "Lagos, Nigeria",
  "districtId": "technology-hub",
  "website": "https://example.com/northwind",
  "logoColor": "#6fe0ff",
  "openRoles": 6
}
```

`districtId` places the company in Grooveli City. Valid values are the location
ids in `src/game/world/locations.js`:
`corporate-district`, `recruitment-agency`, `university-campus`,
`technology-hub`, `creative-district`, `healthcare-district`,
`hospitality-district`, `finance-district`.

`logoColor` is a hex string used to generate a monogram tile. No logo files are
uploaded or served, and none are needed.

### 4.4 Employer

```json
{ "id": "emp-001", "userId": "usr-900", "companyId": "cmp-northwind", "role": "Head of Talent", "verified": true }
```

Not consumed by this frontend yet. Included because the PRD requires an employer
experience and the contract should not be invented twice.

### 4.5 Job

```json
{
  "id": "job-001",
  "title": "Backend Engineer",
  "companyId": "cmp-northwind",
  "companyName": "Northwind Systems",
  "districtId": "technology-hub",
  "location": "Lagos / Remote",
  "workMode": "remote",
  "employmentType": "full-time",
  "seniority": "mid",
  "salary": { "min": 500000, "max": 800000, "currency": "NGN", "period": "month" },
  "summary": "…",
  "responsibilities": ["…"],
  "requirements": ["…"],
  "skills": ["Node.js", "NestJS", "PostgreSQL"],
  "matchScore": 41,
  "matchReasons": ["Remote work matches your preference"],
  "skillGaps": ["Node.js", "NestJS"],
  "postedAt": "2026-09-28T08:00:00.000Z",
  "featured": true
}
```

`companyName` is denormalised on purpose: job lists render thousands of rows and
should not need a second request.

**`matchScore`, `matchReasons` and `skillGaps` are the matching service's
output and must be computed per requesting candidate.** The frontend treats them
as authoritative and renders them as the explanation surface the PRD asks for
("why this candidate matches / what gaps exist"). `matchReasons` are shown
verbatim, so they must be written as sentences a candidate can read.

Enumerations:
- `workMode` ∈ `onsite` | `hybrid` | `remote`
- `employmentType` ∈ `full-time` | `part-time` | `contract` | `internship` | `freelance`
- `seniority` ∈ `entry` | `junior` | `mid` | `senior` | `lead`
- `salary.period` ∈ `month` | `year`

### 4.6 Application

```json
{
  "id": "app-001",
  "jobId": "job-019",
  "jobTitle": "Payroll Specialist",
  "companyName": "Harbour & Co.",
  "status": "interview",
  "appliedAt": "2026-09-21T10:12:00.000Z",
  "updatedAt": "2026-10-03T14:00:00.000Z",
  "note": "First-stage call completed."
}
```

`status` ∈ `draft` | `submitted` | `in-review` | `interview` | `offer` |
`rejected` | `withdrawn`.

### 4.7 Interview

```json
{
  "id": "int-001",
  "applicationId": "app-001",
  "companyName": "Harbour & Co.",
  "jobTitle": "Payroll Specialist",
  "type": "final",
  "scheduledAt": "2026-10-07T10:00:00.000Z",
  "status": "scheduled",
  "score": null
}
```

`type` ∈ `simulation` | `screening` | `technical` | `final`.
`status` ∈ `scheduled` | `completed` | `cancelled`.
`score` (0–100) is present only on completed simulations.

### 4.8 Mission and MissionObjective

```json
{
  "id": "msn-first-job",
  "title": "Get Your First Job",
  "description": "…",
  "type": "career",
  "category": "onboarding",
  "difficulty": "medium",
  "xpReward": 250,
  "locationId": "recruitment-agency",
  "unlocksLevel": "Level 2",
  "reward": "Unlocks verified candidate status",
  "objectives": [
    {
      "id": "obj-apply",
      "label": "Apply to three suitable jobs",
      "hint": "Only roles matching 60% or better count.",
      "event": "application.suitable",
      "target": 3,
      "actionLabel": "Browse jobs",
      "actionRoute": "/jobs"
    }
  ]
}
```

**The `event` field is the contract that makes missions data rather than code.**
An objective advances when the career event it names is recorded. The event
vocabulary is fixed and defined in `src/utils/careerEvents.js`:

| Event | Fired when |
| --- | --- |
| `profile.completed` | Profile completeness reaches 100 |
| `cv.uploaded` | A CV is attached |
| `assessment.completed` | The AI career assessment finishes |
| `job.viewed` | A job detail is opened |
| `job.saved` | A job is saved |
| `application.suitable` | An application is submitted to a role matching ≥ 60 |
| `application.unsuitable` | An application is submitted below that threshold |
| `interview.simulated` | An interview simulation completes |
| `skill.challenge` | A skill mission is passed |
| `course.completed` | A course is completed |
| `location.visited` | A district is entered for the first time |
| `ai.consulted` | A message is sent to Grooveli AI |

`type` ∈ `career` | `skill` | `discovery`. `difficulty` ∈ `easy` | `medium` | `hard`.
`locationId`, when present, scopes the mission to one place in the city.

### 4.9 MissionProgress

```json
{
  "missionId": "msn-first-job",
  "status": "active",
  "objectiveCounts": { "obj-profile": 1, "obj-apply": 2 },
  "completedAt": null
}
```

`status` ∈ `locked` | `available` | `active` | `completed`.
`objectiveCounts` maps objective id to how many times its event has fired.

### 4.10 XP and career level

| Activity | XP |
| --- | --- |
| Complete profile | 50 |
| Upload CV | 25 |
| Career assessment | 75 |
| Skill challenge | 100 |
| Application to a **suitable** role | 25 |
| Interview simulation | 100 |
| Course completion | 200 |
| Mission completion | the mission's `xpReward` |
| Everything else | 0 |

**Two product rules the backend must enforce, not just the frontend:**

1. **Applications below the match threshold are worth zero XP.** The PRD is
   explicit that the system must not reward spam applications. The threshold is
   60 (`SUITABLE_MATCH_THRESHOLD`); keep the two in step.
2. **One-off events count once.** Completing a profile, uploading a CV and
   finishing the assessment each award XP a single time, regardless of how many
   times the action is repeated.

The level curve is in `src/utils/progression.js`:

```
xpForLevel(n)      = round(120 × 1.18^(n-1))
totalXpForLevel(n) = Σ xpForLevel(1..n-1)
```

Level 1→2 costs 120 XP; level 10→11 costs about 534. If the backend owns the
curve instead, return `level`, `xp`, `xpIntoLevel` and `xpForNextLevel` on
`GET /career/stats` and the frontend will stop computing it.

### 4.11 CareerStats

```json
{
  "level": 17, "xp": 14280, "reputation": 82,
  "completedMissions": 47, "certifications": 6,
  "applications": 23, "interviews": 8, "offers": 3,
  "jobsViewed": 164, "locationsVisited": 7
}
```

`reputation` is 0–100 and is the backend's to define. The frontend only displays
it.

### 4.12 Notification

```json
{
  "id": "ntf-001",
  "type": "match",
  "title": "4 new job matches",
  "body": "Grooveli AI found four roles above 75% match…",
  "createdAt": "2026-10-05T07:20:00.000Z",
  "read": false,
  "route": "/jobs"
}
```

`type` ∈ `match` | `application` | `interview` | `mission` | `system`.
`route` is an in-app path opened when the notification is tapped. Send a path,
never an absolute URL.

### 4.13 AI conversation, message and briefing

```json
{
  "id": "msg-1001",
  "role": "assistant",
  "content": "I looked at 22 open roles against your profile…",
  "createdAt": "2026-10-05T09:00:00.000Z",
  "actions": [{ "id": "act-open-jobs", "label": "Open these matches", "intent": "find-jobs" }],
  "references": { "jobIds": ["job-002", "job-011"], "missionIds": [] }
}
```

`content` is rendered as plain text with newlines preserved. **Do not send
Markdown or HTML** — the frontend does not parse either, by design.

`actions[].intent` is routed by the interface, not pasted into a prompt. Known
intents: `find-jobs`, `improve-cv`, `prepare-interview`, `find-skill-gaps`,
`career-advice`, `assessment`, `general`.

`references` lets the UI link a reply to real records.

---

## 5. Endpoints

Everything below is **MOCKED** today. The "Mocked in" column names the file to
delete the mock branch from.

### Jobs

| Method | Path | Purpose | Mocked in |
| --- | --- | --- | --- |
| GET | `/jobs` | List and search | `jobService.js` |
| GET | `/jobs/:id` | One job | `jobService.js` |
| GET | `/jobs/recommended?limit=` | AI-surfaced matches | `jobService.js` |
| GET | `/jobs/saved` | `{ "savedJobIds": [...] }` | `jobService.js` |
| POST | `/jobs/:id/save` | Save | `jobService.js` |
| DELETE | `/jobs/:id/save` | Unsave | `jobService.js` |
| POST | `/jobs/:id/apply` | Apply → `Application` | `applicationService.js` |

`GET /jobs` query parameters, sent exactly as the filter UI produces them:

| Param | Type | Notes |
| --- | --- | --- |
| `search` | string | Matches title, company, location, summary, skills |
| `districtId` | string | One city district |
| `employmentTypes` | repeated | `?employmentTypes=full-time&employmentTypes=contract` |
| `workModes` | repeated | |
| `seniority` | repeated | |
| `minSalary` | integer | Against `salary.max` |
| `minMatch` | integer | 0–100 |
| `sort` | string | `match` (default) \| `recent` \| `salary` |

Repeated parameters are serialised one key per value. Pagination is not used
yet; when the catalogue grows, return `{ items, total, nextCursor }` and the
list component will take a cursor.

**`POST /jobs/:id/apply` must be idempotent per candidate+job.** A second
application returns the existing record (200 or 409 with the record in
`details`), never a duplicate.

### Applications and interviews

| Method | Path | Purpose | Mocked in |
| --- | --- | --- | --- |
| GET | `/applications` | The candidate's applications | `applicationService.js` |
| GET | `/interviews` | Scheduled and completed interviews | `applicationService.js` |
| POST | `/interviews/simulations` | Record a completed simulation | `applicationService.js` |

### Career profile

| Method | Path | Purpose | Mocked in |
| --- | --- | --- | --- |
| GET | `/career/profile` | `CandidateProfile` | `profileService.js` |
| PATCH | `/career/profile` | Partial update → updated profile | `profileService.js` |
| POST | `/career/profile/cv` | CV upload | `profileService.js` |
| POST | `/career/profile/skills/verify` | `{ "skill": "Excel" }` | `profileService.js` |
| GET | `/career/stats` | `CareerStats` | `profileService.js` |
| GET | `/career/achievements` | Achievement list | `profileService.js` |

**CV upload needs a decision.** The prototype records a file name only; nothing
is uploaded and the file never leaves the browser. The real endpoint should take
`multipart/form-data` with a `file` part and return the updated
`CandidateProfile` with `cv.hasCv`, `cv.fileName` and `cv.updatedAt` populated.
Please also return a signed download URL if the candidate should be able to
retrieve it.

### Missions and XP

| Method | Path | Purpose | Mocked in |
| --- | --- | --- | --- |
| GET | `/missions` | Definitions, optionally `?type=` `?locationId=` | `missionService.js` |
| GET | `/missions/:id` | One mission | `missionService.js` |
| GET | `/missions/progress` | `MissionProgress[]` | not yet called — progress is local |
| POST | `/missions/:id/complete` | Record completion | `missionService.js` |
| POST | `/missions/:id/attempt` | Run and score a skill challenge | `missionService.js` |

**Still to design: `POST /career/events`.** XP and mission progress are
currently held in `localStorage` (see section 7). The clean replacement is a
single write the frontend already funnels everything through
(`recordCareerEvent` in `src/stores/progression.js`):

```json
{ "event": "application.suitable", "occurredAt": "2026-10-05T09:00:00.000Z", "context": { "jobId": "job-002" } }
```

**200**
```json
{
  "xpAwarded": 25,
  "totalXp": 14305,
  "level": 17,
  "levelledUp": false,
  "missionsAdvanced": [{ "missionId": "msn-first-job", "justCompleted": false }]
}
```

With that endpoint, the server owns the XP table, the one-off rule and the
anti-spam rule, and the frontend becomes a pure renderer of the response.

### Learning

| Method | Path | Purpose | Mocked in |
| --- | --- | --- | --- |
| GET | `/learning/courses` | Courses, optionally `?skill=` | `learningService.js` |
| POST | `/learning/courses/:id/complete` | Completion → certification | `learningService.js` |

### Companies

| Method | Path | Purpose | Mocked in |
| --- | --- | --- | --- |
| GET | `/companies` | Optionally `?districtId=` | `companyService.js` |
| GET | `/companies/:id` | One company | `companyService.js` |

### Notifications

| Method | Path | Purpose | Mocked in |
| --- | --- | --- | --- |
| GET | `/notifications` | Newest first | `notificationService.js` |
| POST | `/notifications/:id/read` | Mark one read | `notificationService.js` |
| POST | `/notifications/read-all` | Mark all read | `notificationService.js` |

### AI

| Method | Path | Purpose | Mocked in |
| --- | --- | --- | --- |
| GET | `/ai/briefing` | The standing briefing | `aiService.js` |
| POST | `/ai/chat` | `{ conversationId?, content, intent }` → `AIMessage` | `aiService.js` |
| POST | `/ai/assessment` | Run the career assessment | `aiService.js` |
| POST | `/ai/interview-simulation` | `{ jobTitle }` → scored result | `aiService.js` |

`GET /ai/briefing` returns:

```json
{
  "greeting": "Welcome back, John.",
  "question": "What would you like to work on?",
  "highlights": [{ "id": "hl-matches", "label": "new job matches", "value": 4, "route": "/jobs" }],
  "actions": [{ "id": "act-jobs", "label": "Find Jobs", "intent": "find-jobs" }]
}
```

Highlights with a `value` of 0 should be omitted; the frontend filters them out
as a safety net but an honest briefing is the backend's job.

---

## 6. AI requirements

**The hard rule: no model provider is ever called from the browser, and no
provider key ever reaches this bundle.** Every Vite variable prefixed `VITE_` is
inlined into the public JavaScript. `src/services/aiService.js` carries this
boundary in a comment at the top of the file; please keep it true.

The backend owns:

- Provider credentials and provider choice.
- The system prompt and the agent's tool surface.
- Rate limiting and abuse controls, per user.
- Conversation persistence (`AIConversation`).
- Retrieval of the candidate's own data. The agent must only ever see the
  requesting candidate's profile, applications and matches.

Behaviour the frontend is built around:

- **Grounded replies.** The briefing and the replies cite real counts and real
  roles. The mock does this from live data; the real agent must too, or the
  interface will look like it is lying.
- **Routed actions, not prompts.** Suggested actions carry an `intent`. The
  backend should map an intent to a tool call, not re-parse the label text.
- **Confirmation before consequential actions.** The PRD's example has the agent
  prepare applications and ask before submitting. The frontend already
  implements confirm-then-act for applying; the agent must never submit an
  application as a side effect of a chat turn.
- **Streaming is not required** but is supported by the UI shape: the typing
  indicator is already there. If you stream, use SSE on `POST /ai/chat` and
  send `{ delta }` frames followed by a final `AIMessage`.

Timeouts: the UI shows a thinking state indefinitely but has no cancel. If a
turn may exceed ~30s, return a job id and a polling endpoint instead.

---

## 7. What the frontend currently persists, and why it must stop

| Data | Where | Why it is temporary |
| --- | --- | --- |
| XP, reputation, XP ledger | `localStorage` key `grooveli:career-progress` | Progression is backend state. Replace with `POST /career/events` + `GET /career/stats` |
| Mission objective counts | `localStorage` key `grooveli:mission-progress` | Replace with `GET /missions/progress` |
| Auth token | `localStorage` key `grooveli:auth-token` | Fine to keep, or move to an httpOnly cookie if you prefer |
| Applications, saved jobs, profile edits | In-memory only, `src/services/mockDb.js` | Session-scoped stand-in. Delete the file when the API lands |

`src/services/mockDb.js` exists solely so mock services behave like a real API
(an application you submit appears in the list afterwards). It is deliberately
not persisted — persistence is the backend's job.

---

## 8. UI states the API must make possible

Every list and panel in the product renders four states. The components exist
(`src/components/ui/StateViews.jsx`); the API only has to make them reachable.

**Loading.** Skeletons for lists, a spinner for single records. Mock latency is
deliberately non-zero (`VITE_MOCK_LATENCY`, default 360ms) so these stay
honest in development.

**Empty.** Distinguished from error. An empty list is `200` with `[]`, never
`404` and never `null`. Each empty state is written for its context:

| Surface | Empty copy |
| --- | --- |
| Job list | "No roles match that" + clear filters |
| Applications | "No applications yet" |
| Missions | "No missions here" / "No missions completed yet" |
| Notifications | "Nothing new" |
| Achievements | "No achievements yet" |
| Companies | "No employers here yet" |

**Error.** Rendered from `ApiError.message`, with a retry that re-runs the same
request. This is why `message` must be user-facing prose.

**Authenticated / unauthenticated.** Covered in section 2.

---

## 9. Environment variables

The frontend reads exactly three, all documented in `.env.example`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | empty | API root. Empty keeps mocks on |
| `VITE_USE_MOCKS` | `true` | `false` routes services at the real API |
| `VITE_MOCK_LATENCY` | `360` | Artificial latency for mock calls, ms |

**Nothing secret belongs in any of them.** No AI keys, no database credentials,
no auth secrets, no private tokens. Anything prefixed `VITE_` is published to
every visitor in plain text.

---

## 10. Out of scope for this frontend

The PRD describes more than the MVP builds. These contracts are documented
above where they were cheap to pin down, but no interface consumes them yet:

- The employer experience (job posting, candidate search, shortlisting, the
  recruiter AI, the hiring pipeline).
- Multiplayer, leaderboards and virtual career fairs.
- Real course delivery; the Training Center completes a course in one click.
- Payments or Grooveli Credits.

---

## 11. Suggested order of integration

Each step is independently shippable, and the UI keeps working with the rest
still mocked.

1. `POST /auth/login`, `GET /users/me` — everything else needs an identity.
2. `GET /jobs`, `GET /jobs/:id` — the largest surface and the easiest to verify.
3. `GET /career/profile`, `PATCH /career/profile`, CV upload.
4. `POST /jobs/:id/apply`, `GET /applications`.
5. `GET /missions` and `POST /career/events` — this is where XP stops being a
   browser-local fiction.
6. `GET /notifications` and friends.
7. `POST /ai/chat` and the rest of the AI surface.
8. Companies and learning.
