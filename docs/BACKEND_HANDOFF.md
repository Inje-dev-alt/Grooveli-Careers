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

**MOCKED** in `src/services/authService.js`. Passwords are compared in the
browser. This is not authentication and is labelled as such in the UI.

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

**Still to design: `POST /career/events`.** XP, reputation, mission progress and
achievements are currently computed client-side and written back through
`PUT /career/progress`. The clean replacement is a single write the frontend
already funnels everything through (`recordCareerEvent` in
`src/stores/progression.js`):

```json
{ "event": "application.suitable", "occurredAt": "…", "context": { "jobId": "job-002" } }
```

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

### 4.6 Social

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

**Only achievements the candidate has actually earned may be attached**, and
`verified` must come from the backend. An attachable achievement that was not
earned would turn the feed from social proof into noise.

`body` is rendered as plain text with newlines preserved. **Do not send Markdown
or HTML** — the frontend does not parse either, by design.

Connections and follows are **separate relationships**: a user connects with a
user (mutual, with a `pending` state) and follows a user or an organization
(one-way). Keeping them apart now means the social graph does not need rebuilding
when either side grows.

### 4.7 AI

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

## 5. Endpoints

All **MOCKED** today. "Mocked in" names the file to delete the branch from.

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

### Organizations
| Method | Path | Mocked in |
| --- | --- | --- |
| GET | `/organizations`, `/organizations/:id` | `organizationService.js` |
| GET | `/organizations/active` | `organizationService.js` |
| PATCH | `/organizations/:id` | `organizationService.js` |
| GET / POST | `/organizations/:id/jobs` | `organizationService.js` |
| GET | `/organizations/:id/applications` | `organizationService.js` |
| GET | `/organizations/:id/overview` | `organizationService.js` |
| PATCH | `/applications/:id` (status) | `organizationService.js` |

### Career
| Method | Path | Mocked in |
| --- | --- | --- |
| GET / PUT | `/career/progress` | `careerService.js` |
| GET | `/career/stats`, `POST /career/stats/increment` | `careerService.js` |
| GET | `/career/achievements`, `POST /career/achievements/evaluate` | `careerService.js` |
| GET / POST | `/career/activity` | `careerService.js` |

### Missions and learning
| Method | Path | Mocked in |
| --- | --- | --- |
| GET | `/missions`, `/missions/:id` | `missionService.js` |
| GET / PUT | `/missions/progress` | `missionService.js` |
| POST | `/missions/:id/complete`, `/missions/:id/attempt` | `missionService.js` |
| GET | `/learning/courses`, `POST /learning/courses/:id/complete` | `learningService.js` |

### Social
| Method | Path | Mocked in |
| --- | --- | --- |
| GET / POST | `/social/posts` | `socialService.js` |
| POST | `/social/posts/:id/like`, `/social/posts/:id/comments` | `socialService.js` |
| GET | `/social/connections/suggestions`, `POST /social/connections` | `socialService.js` |
| GET / POST | `/social/follows` | `socialService.js` |

### AI
| Method | Path | Mocked in |
| --- | --- | --- |
| GET | `/ai/briefing` | `aiService.js` |
| POST | `/ai/chat` | `aiService.js` |
| GET | `/ai/career/next-action`, `/ai/career/discovery` | `aiService.js` |
| POST | `/ai/assessment`, `/ai/interview-simulation` | `aiService.js` |

### Notifications
`GET /notifications`, `POST /notifications/:id/read`,
`POST /notifications/read-all` — `notificationService.js`.

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
recruiter AI, interview scheduling, external job ingestion, notifications
delivery, and organization permission enforcement.

---

## 11. Suggested order of integration

Each step is independently shippable; the UI keeps working with the rest mocked.

1. `/auth/*` and `/users/me` — everything needs an identity.
2. `GET /jobs`, `GET /jobs/:id` — the largest surface, easiest to verify.
3. `/candidates/me` and CV upload.
4. `POST /jobs/:id/apply`, `GET /applications`.
5. `/organizations/*` — employer side becomes real, and `source:
   "grooveli_employer"` jobs start flowing into the same marketplace.
6. `GET /missions` and `POST /career/events` — XP stops being browser-local.
7. `/social/*`.
8. `/ai/*`.
