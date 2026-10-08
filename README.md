# Grooveli Careers — Frontend MVP

An AI-powered career marketplace experienced through **Grooveli City**, an
interactive browser career world.

> Grooveli City is not a game about jobs. It is a career platform experienced
> like a game.

The city is the experience layer. Underneath it is a real employment product:
candidates, employers, companies, jobs, applications, a professional network and
AI. Every mechanic connects to a career outcome — walking into the Technology
Hub opens the roles actually open there, and XP comes from finishing a profile or
passing a skill assessment, never from time spent in the product.

This is the **frontend prototype**. There is no backend. Every data path runs
through a service layer backed by realistic mock data, written so the mocks can
be swapped for real endpoints without touching a component. See
[`docs/BACKEND_HANDOFF.md`](docs/BACKEND_HANDOFF.md).

---

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # production build
npm run preview  # serve the build
npm run lint
```

Node 20+. The defaults run entirely on mocks and need no configuration; copy
`.env.example` to `.env` only if you want to change something.

### Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Candidate | `candidate@grooveli.test` | `grooveli` |
| Employer | `employer@grooveli.test` | `grooveli` |

Or create an account — registration, role selection and onboarding all work, and
a new candidate correctly starts at **level 1 with 0 XP**.

---

## The two journeys you can demonstrate

**Candidate.** Create an account → choose *Find opportunities* → five-step
career onboarding → enter Grooveli City → walk to a district and press **E** →
explore jobs, missions or career discovery → complete a skill challenge, earn XP
and an achievement → check the AI Career Center for your next move and the reason
for it → apply to a role above 60% match → share the achievement on the network.

**Employer.** Create an account → choose *Hire talent* → company onboarding →
employer dashboard → publish a role → **it appears in the same marketplace
candidates browse**, tagged `grooveli_employer` → discover candidates whose
skills carry assessment scores → move an application along the pipeline.

That crossover is the thing worth watching: one job object, published by an
employer, consumed unchanged by the candidate marketplace.

---

## What works

**Identity.** One account, two capabilities. `roles` is an array and
`activeRole` selects the experience, so a recruiter who is also job-hunting is
one user. Mock sign-in, registration, role selection, both onboarding flows, and
role switching from the menu.

**Grooveli City.** Eleven locations in a compact top-down world with a shallow
2.5D extrusion: spawn plaza, your apartment, the AI Career Center, recruitment
agency, training centre, and the technology, creative, healthcare, hospitality,
finance and corporate districts. Movement, camera, collision, labels, proximity
highlighting.

**One interaction system.** Walk up to anything and an `[E] ENTER` prompt
appears; pressing E opens a panel whose actions come from that location's own
data. Buildings and apartment furniture share it — there is no per-building code.

**Career identity.** Profile, skills with verification and assessment scores,
experience, education, completeness checklist, CV, statistics, achievements and a
career activity stream.

**Career progression.** XP, levels, missions whose objectives listen for career
events, achievements earned from the same events, and reputation as a separate
number.

**Job marketplace.** Search, facet filters (district, location, industry,
employment type, work type, experience level, skills, salary, match), sorting,
job detail with the match explanation, saving, and a confirm-then-apply flow.
Reachable from the city *and* as a standalone route.

**Employer space.** Dashboard with company and recruitment overview, job
creation, published job management, candidate discovery, and a pipeline you can
move applications through.

**AI Career Center.** A grounded briefing, routed suggested actions, chat, the
career assessment, interview simulation, career discovery, and the next career
action with its reasoning.

**Grooveli Network.** Feed, composer with achievement attachment, likes,
comments, connections and company follows.

**Responsive.** Desktop first for the world; the HUD adapts, a virtual joystick
and tap-to-interact appear on phones, panels become bottom sheets.

---

## Architecture

```
src/
  game/                  A — the world
    world/               locations, city layout, renderer, apartment
    scenes/              CityScene, ApartmentScene
    entities/ systems/   Player; Control, Interaction, Camera
    bridge.js            the only channel between world and interface

  components/            B — the interface
    auth/ onboarding/ shell/ employer/ social/
    game/ hud/ ui/ jobs/ missions/ profile/ ai/ locations/
  pages/                 SignIn, SignUp, RoleSelect, onboarding,
                         City, Apartment, Jobs, Missions, AI, Network, Profile,
                         Employer{Dashboard,Jobs,Candidates,Company}
  stores/                auth, onboarding, player, career, mission, job,
                         social, employer, ui, notification

  services/              C — the data boundary
    apiClient.js         the only module that calls fetch
    authService  candidateService  careerService  organizationService
    jobService   applicationService  missionService  learningService
    socialService  aiService  notificationService
    mockDb.js            the backend stand-in

  mock/                  users, organizations, jobs, candidates, applications,
                         missions, skills, courses, notifications, social
  models/                data contracts (JSDoc), shared with the handoff doc
  hooks/ utils/ styles/
```

**The world never imports a component and the interface never reaches into a
scene.** Shared state travels through stores; one-off commands through
`game/bridge.js`. That is what keeps the renderer replaceable.

**Components never call `fetch` and never import mock data.** Both hold today
and are checkable with a grep:

```bash
grep -rn "fetch(" src --include=*.jsx          # nothing outside apiClient
grep -rn "from '.*mock/" src/components src/pages   # nothing
```

Every service is written as "the real endpoint, or the mock":

```js
export function listJobs(query) {
  return withMock(
    async () => { /* mocked */ },
    () => apiClient.get('/jobs', { params: query }),
  );
}
```

### Locations are data

```js
{
  id: 'technology-hub',
  name: 'Technology Hub',
  type: 'career-district',
  position: { x: 1090, y: 330 },
  size: { width: 350, height: 250 },
  accent: '#6fe0ff',
  interactions: ['jobs', 'missions', 'career-ai', 'companies'],
}
```

`interactions` are ids resolved by
`components/locations/interactionRegistry.jsx`, the one place that knows what an
interaction means. Adding a district is an entry in `game/world/locations.js`;
giving it a behaviour is one string.

### Jobs are normalised

One `Job` shape with `source` ∈ `grooveli_employer | workpedia | partner | mock`.
**No screen branches on it.** A role published by an employer, a partner feed
later and a seeded mock today are the same object above the service layer — that
is the migration path from mock jobs to real ones.

### Missions are data

An objective names the career event that advances it:

```js
{ id: 'obj-apply', label: 'Apply to three suitable jobs',
  event: CAREER_EVENTS.SUITABLE_JOB_APPLIED, target: 3 }
```

Everything that matters calls one function, `recordCareerEvent`, which fans the
event out to XP, reputation, missions, achievements, the activity stream and
notices. No screen awards XP directly.

### XP is earned; reputation is proved

| Activity | XP |
| --- | --- |
| Complete profile | 50 |
| Upload CV | 25 |
| Career assessment | 75 |
| Skill challenge | 100 |
| Interview simulation | 100 |
| Application to a **suitable** role | 25 |
| Course completion | 200 |

Deliberate zeros: viewing a job, saving a job, posting, connecting, and applying
below the 60% match threshold. The interface says so before you apply. The system
cannot be farmed by volume, because volume is not career progress.

**Reputation is a separate number** and only moves on work someone else could
verify — a passed assessment, a completed course, a finished interview. XP is
progression; reputation is credibility.

---

## State

| Store | Owns |
| --- | --- |
| `authStore` | Session, roles, active role, onboarding gates |
| `onboardingStore` | The onboarding draft (a form, not career data) |
| `playerStore` | Position, facing, animation, nearby/active location |
| `careerStore` | XP, reputation, the XP ledger |
| `missionStore` | Mission definitions and objective progress |
| `jobStore` | The search query, saved jobs, applications |
| `socialStore` | Feed, likes, connections, follows |
| `employerStore` | Active organization, its jobs and pipeline |
| `uiStore` | Modal stack, toasts, menu, viewport |
| `notificationStore` | The notification feed |

Player state is stored separately from rendering: Phaser writes transforms into
`playerStore` (throttled) and React reads what it needs.

**Persistence.** `services/mockDb.js` snapshots itself to `localStorage` so a
registered account and a published job survive a reload — otherwise the
prototype cannot be demonstrated in one sitting. That is storage belonging to the
backend stand-in, not to the interface, and it goes when the API lands. The auth
token decides who is signed in; the snapshot deliberately does not persist it.

---

## Visual identity

Dark, modern, slightly futuristic: a deep blue-black foundation, a
mint-to-indigo gradient, glass panels, soft shadows, minimal motion. Every
colour, radius and shadow comes from `src/styles/tokens.css`; no component
invents a raw value.

The city is drawn entirely from generated shapes — **no image assets, borrowed
or otherwise**. District accent colours are shared between the world and the
interface, so a job card from the Technology Hub carries the same signature as
the building.

---

## Security

No AI keys, database credentials, auth secrets or private tokens exist anywhere
in this bundle, and none should be added: everything prefixed `VITE_` is inlined
into the public JavaScript every visitor downloads.

AI requests will go to Grooveli's own backend (`POST /ai/chat`), which holds the
model credentials server-side. `src/services/aiService.js` states this at the top
of the file. The mock sign-in is labelled as a prototype in the UI, and the
sign-up screen warns against reusing a real password.

---

## Performance notes

- The city's ground, roads, planting and street furniture bake once into a
  render texture, and each building facade into its own. A Phaser `Graphics`
  object replays its whole command list every frame; unbaked, the city dropped
  to single-digit frame rates.
- Phaser loads via dynamic import, so the marketplace, network, profile, AI and
  the entire employer space never download the engine.

---

## What is not built

Per the brief: production authentication, payments and employer billing,
real-time messaging, multiplayer, recommendation algorithms, a production AI
provider, external job ingestion, advanced analytics, leaderboards, and
organization permission enforcement. Contracts for the employer and social sides
are documented in the handoff where they were cheap to pin down, so they are not
invented twice.
