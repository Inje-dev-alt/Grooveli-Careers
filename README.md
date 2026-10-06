# Grooveli Careers — Frontend MVP

An AI-powered career marketplace experienced through **Grooveli City**, an
interactive browser career world.

> Grooveli City is not a game about jobs. It is a career platform experienced
> like a game.

The city is the experience layer. Underneath it is a real employment product:
companies, jobs, candidates, matching, applications, interviews, hiring. Every
mechanic in the world connects to a career outcome — walking into the Technology
Hub opens the roles that are actually open there, and the XP you earn comes from
finishing a profile or passing a skill challenge, never from clicking around.

This repository is the **frontend prototype**. There is no backend yet. Every
data path runs through a service layer backed by realistic mock data, written so
the mocks can be swapped for real endpoints without touching a component. See
[`docs/BACKEND_HANDOFF.md`](docs/BACKEND_HANDOFF.md).

---

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # production build into dist/
npm run preview  # serve the build
npm run lint
```

Node 20 or newer.

Copy `.env.example` to `.env` if you want to change anything — the defaults run
entirely on mocks and need no configuration.

---

## What works

**Grooveli City.** Eleven locations laid out in a compact top-down world with a
shallow 2.5D extrusion: the spawn plaza, your apartment, the AI Career Center,
the recruitment agency, the training centre, and the technology, creative,
healthcare, hospitality, finance and corporate districts. Player movement,
camera follow, collision, location labels and proximity highlighting.

**One interaction system.** Walk up to anything interactable and an `[E] ENTER`
prompt appears. Pressing E opens a panel whose actions come from that location's
own data. Buildings and apartment furniture use the same system — there is no
per-building code anywhere.

**Career HUD.** Name, career level, XP bar, reputation, current location,
notifications and the menu, kept small enough to leave the city visible.

**Your apartment.** Desk → career dashboard, laptop → job marketplace, CV folder
→ profile and CV, trophy shelf → achievements, career wall → statistics, phone →
notifications.

**Job marketplace.** Search, facet filters, sorting, job detail with the match
explanation, saving, and an application flow that confirms before it submits.
Reachable from inside the city *and* as a standalone route, because the
marketplace has to work without the game.

**Missions and XP.** Career, skill and discovery missions defined as data.
Objectives advance from career events rather than from mission-specific code, so
a new mission is a new record, not a new screen.

**AI Career Center.** A briefing drawn from your real state, routed suggested
actions, a chat thread, the career assessment and an interview simulation.
Responses are mocked locally — no model provider is ever called from the browser.

**Responsive.** Desktop is the primary experience. On small screens the HUD
adapts, a virtual joystick and tap-to-interact button appear, and panels become
bottom sheets.

---

## Architecture

The three layers the PRD asks for are kept genuinely separate.

```
src/
  game/                  A — the world
    world/               locations, city layout, renderer, apartment
    scenes/              CityScene, ApartmentScene
    entities/            Player
    systems/             ControlSystem, InteractionSystem, CameraSystem
    bridge.js            the only channel between world and interface
    config.js

  components/            B — the interface
    game/ hud/ ui/
    jobs/ missions/ profile/ ai/ locations/ shell/
  pages/                 City, Apartment, Jobs, Missions, Profile, AI, Landing
  stores/                auth, player, career, mission, job, ui, notification

  services/              C — the data boundary
    apiClient.js         the only module that calls fetch
    authService.js jobService.js profileService.js missionService.js
    applicationService.js aiService.js companyService.js
    notificationService.js learningService.js
    mockDb.js            session-scoped stand-in for the backend

  mock/                  users, jobs, companies, missions, skills,
                         notifications, applications, courses
  models/                data contracts (JSDoc), shared with the handoff doc
  hooks/ utils/ styles/
```

**The world never imports a component and the interface never reaches into a
scene.** Shared state travels through the Zustand stores; one-off commands
travel through `game/bridge.js`. That is what makes the renderer replaceable —
a richer 2.5D or 3D world later only has to speak the same small vocabulary.

**Components never call `fetch` and never import mock data.** They call
services. Every service function is written as "the real endpoint, or the mock":

```js
export function listJobs(query) {
  return withMock(
    async () => { /* mocked */ },
    () => apiClient.get('/jobs', { params: query }),
  );
}
```

Turning the backend on is three steps, documented in the handoff: point
`VITE_API_BASE_URL` at the API, set `VITE_USE_MOCKS=false`, and delete mock
branches one service at a time. No component changes.

### Locations are data

```js
{
  id: 'technology-hub',
  name: 'Technology Hub',
  type: 'career-district',
  tagline: 'Technology careers and skill opportunities.',
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

### Missions are data

An objective names the career event that advances it:

```js
{ id: 'obj-apply', label: 'Apply to three suitable jobs',
  event: CAREER_EVENTS.SUITABLE_JOB_APPLIED, target: 3 }
```

Everything that matters calls one function, `recordCareerEvent`, which fans the
event out to XP, missions and notices. No screen awards XP directly.

### XP is earned, not farmed

| Activity | XP |
| --- | --- |
| Complete profile | 50 |
| Upload CV | 25 |
| Career assessment | 75 |
| Skill challenge | 100 |
| Application to a **suitable** role | 25 |
| Interview simulation | 100 |
| Course completion | 200 |

Two rules are deliberate. Applying to a role below your 60% match threshold
earns **nothing**, and the interface says so before you apply. One-off
achievements count once. Viewing and saving jobs are worth zero. The system
cannot be farmed by volume, because volume is not career progress.

---

## State

| Store | Owns |
| --- | --- |
| `authStore` | Session and auth status |
| `playerStore` | Position, facing, animation, nearby and active location |
| `careerStore` | XP, reputation, the XP ledger |
| `missionStore` | Mission definitions and objective progress |
| `jobStore` | The search query, saved jobs, applications |
| `uiStore` | Modal stack, toasts, menu, viewport |
| `notificationStore` | The notification feed |

Player state is stored separately from rendering: Phaser writes transforms into
`playerStore` (throttled) and React reads whatever it needs.

**Temporary persistence.** XP and mission progress are written to
`localStorage` so a reload does not wipe your progress during the prototype.
That is the backend's job and is flagged as such in the code and the handoff
document. Nothing else is persisted — `services/mockDb.js` is session-scoped on
purpose, so the frontend never pretends to own business data.

---

## Visual identity

Dark, modern and slightly futuristic: a deep blue-black foundation, a
mint-to-indigo gradient, glass panels, soft shadows and minimal motion. Every
colour, radius and shadow comes from `src/styles/tokens.css`; no component
invents a raw value.

The city is drawn entirely from generated shapes — **no image assets, borrowed
or otherwise**, and no resemblance to any existing game. District accent colours
are shared between the world and the interface, so a job card from the Technology
Hub carries the same signature as the building.

---

## Security

No AI keys, database credentials, auth secrets or private tokens exist anywhere
in this bundle, and none should ever be added. Everything prefixed `VITE_` is
inlined into the public JavaScript that every visitor downloads.

AI requests will go to Grooveli's own backend (`POST /ai/chat`), which holds the
model credentials server-side. `src/services/aiService.js` states this boundary
at the top of the file.

---

## Performance notes

Two things matter on modest hardware and are handled:

- The city's ground, roads, planting and street furniture are baked once into a
  render texture, and each building facade into its own texture. A Phaser
  `Graphics` object replays its whole command list every frame; left unbaked,
  the city dropped to single-digit frame rates.
- Phaser is loaded with a dynamic import, so the marketplace, profile and AI
  routes never download the engine.

---

## What is not built

The PRD describes more than this MVP. Not included: the employer experience
(posting, candidate search, shortlisting, the recruiter AI, the hiring
pipeline), multiplayer and leaderboards, real course delivery, and payments.
Contracts for the employer side are documented in the handoff where they were
cheap to pin down, so they do not get invented twice.
