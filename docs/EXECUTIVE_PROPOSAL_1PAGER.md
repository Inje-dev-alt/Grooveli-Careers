# Grooveli Careers — Executive Product Proposal (1-Pager)

**Prepared for:** Executive Leadership & Stakeholders  
**Initiative:** Production Release & Real-World City Experience  
**Timeline:** 3.5 Calendar Weeks (4 Iterative Phases)  
**Core Stack:** React 19 · Phaser 3 · Supabase (PostgreSQL + Realtime) · Google Gemini AI  

---

## The Vision
Grooveli Careers transforms job hunting from boring resumes into an interactive, gamified career world ("Lagos Hustle to Global Scale"). Candidates build proof of skill, explore city districts, play casual social games while waiting for interviews, and get matched to jobs using native AI profile scanning.

---

## What We Are Delivering (The 10 Core Features)

1. **Seamless City Navigation:** Exiting an office door spawns the player right outside that company's district building rather than resetting to the plaza.
2. **Employer Talent Pipeline:** Complete recruiter workspace with inbox notifications, candidate discovery, and single-invite direct messaging.
3. **Dynamic Street Hustle:** 20 walking commuters, 8 moving vehicles (Danfo buses, tech cabs, scooters), ambient city sounds, and interactive street kiosks.
4. **Social Waiting Room (Ludo Arcade):** 2–4 player multiplayer Ludo board game powered by WebSockets, allowing candidates and recruiters to network casually while awaiting calls.
5. **Global Platform (Multi-Currency & Timezones):** Full support for international salaries (`USD`, `EUR`, `GBP`, `NGN`) and smart notification quiet hours respecting local candidate timezones.
6. **Fair Dual-Sided Leaderboard:** Candidates ranked on verified skill XP; employers ranked on **Hiring Responsiveness (HRS)** rather than post volume.
7. **AI Profile Scanner & Recommendation Copilot:**
   * **1-Click PDF Resume Scan:** Parses skills, experience, and projects in 2 seconds.
   * **Smart Matchmaking:** Semantic `pgvector` matching + spatial HUD navigation waypoints directly to the hiring company in the city.
   * **Skill Gap Diagnostics:** Pinpoints the exact test a candidate needs to pass to reach a 90%+ match.
8. **Live Footer Ticker:** Real-time stream of community milestones (*"Amara passed System Design Assessment"*) and curated tech news.
9. **Persistent Room Avatars:** Multiplayer interior rooms showing real candidates seated at desks with consistent avatar colors.
10. **Automated Mission Reminders:** Scheduled background alerts for expiring missions and upcoming interviews that never disturb users during quiet hours.

---

## Technical & Cost Advantage (Single AI Provider)
* **Single Engine:** Standardized 100% on **Google Gemini** (`GEMINI_API_KEY`).
* **Zero OCR Setup:** Gemini parses raw PDF resumes natively.
* **Cost Efficiency:** Under **$0.02 / active user / month** with sub-second streaming responses and zero API keys exposed to the client.

---

## Rollout Schedule

| Phase | Duration | Key Milestone Delivered |
|---|---|---|
| **Phase 1: Quick Wins** | Days 1–2 | Office doorway exit transitions, employer inbox & messaging. |
| **Phase 2: City Life & Backend** | Days 3–7 | Street traffic/pedestrians, multi-currency, IANA timezones, employer leaderboard. |
| **Phase 3: AI & Multiplayer** | Days 8–17 | Gemini resume scanner, smart match recommendations, Ludo arcade, room avatars. |
| **Phase 4: Production Hardening** | Days 18–21 | Low-bandwidth data saver mode (`saveData`), offline asset caching, load testing. |

---

**Next Action:** Approval to begin Phase 1 engineering immediately.
