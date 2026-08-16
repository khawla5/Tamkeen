# Ministry Internal Training & Career Development Platform

An **Arabic-first** internal web platform for a government **Ministry of Internal Affairs**. Employees take a **Holland (RIASEC) career assessment**, receive a recommended set of career **paths**, choose one, complete **5–10 courses** delivered through an integrated **Moodle** LMS, earn **certificates**, and build a **CV** — all in a clean, modern, right-to-left interface.

> This README is the high-level system overview. The authoritative working files for development are:
> - **`CLAUDE.md`** — rules, full context, page specs, and phased plan the coding agent follows.
> - **`progress.md`** — running log of what has been implemented (read after CLAUDE.md, updated every session).
> - **`decisions.md`** — rationale behind key decisions.

---

## Table of contents
1. [What the system does](#1-what-the-system-does)
2. [Holland (RIASEC) model](#2-holland-riasec-model)
3. [Tech stack](#3-tech-stack)
4. [Architecture](#4-architecture)
5. [Moodle integration](#5-moodle-integration)
6. [Data model](#6-data-model)
7. [Portals & pages](#7-portals--pages)
8. [Design system](#8-design-system)
9. [Development phases](#9-development-phases)
10. [Working agreement (git & context files)](#10-working-agreement-git--context-files)
11. [Getting started](#11-getting-started)

---

## 1. What the system does

The core journey for an employee:

```
Holland assessment  →  Holland Code (top-3 RIASEC letters)
      →  Paths (gold if their letter is in the user's code; any path selectable)
      →  Choose ONE path  →  Build it with 5–10 courses
      →  Take courses + quizzes in Moodle
      →  Course certificate per passed course
      →  Path certificate when the whole path is done
      →  CV builder pre-filled from profile + certificates
```

**Guiding principle — the app is the experience layer; Moodle is the learning engine.**
The application owns identity, the assessment, paths, certificates, the CV, and all Arabic-first UX. Moodle owns course content, quizzes, grading, and completion. The two are linked only by `moodle_user_id` and `moodle_course_id`, and course content is never authored in two places.

**Key product rules**
- Arabic-first, full RTL, from day one (architecture, not styling).
- One path per user; **no switching** once confirmed (hard commitment gate).
- A path requires **5–10 courses** to confirm.
- One Moodle course may belong to several paths; a completed shared course is **reused**, never retaken.
- **Gold = recommendation, not restriction.**
- Certificates are issued by the app as Arabic PDFs and issuance is **idempotent**.
- Pass threshold is a **product setting** evaluated against the Moodle grade.
- **Email/password auth only**, with email verification. **Registration is ministry-scoped** (not open public sign-up).
- Every certificate has a **unique verification ID + QR/public verification page**.
- **Assessment retake** is allowed only **before** a path is confirmed.
- Courses in a confirmed path can't be deleted/unpublished — only hidden from new selections.
- Government-grade baseline: **audit logging, rate-limiting, PII minimization, WCAG 2.1 AA**, and every data view has loading/empty/error states.

---

## 2. Holland (RIASEC) model

The assessment is a Holland Codes / RIASEC career-interest test.

| Letter | Type (EN) | Type (AR) |
|---|---|---|
| **R** | Realistic | الواقعي |
| **I** | Investigative | البحثي / الاستقصائي |
| **A** | Artistic | الفني / الإبداعي |
| **S** | Social | الاجتماعي |
| **E** | Enterprising | المبادِر / الريادي |
| **C** | Conventional | التقليدي / التنظيمي |

- Each answer option maps to one or more RIASEC dimensions with weights.
- Scoring tallies points per dimension → a ranked profile of all six letters.
- The user's **Holland Code** is the **top three letters** in rank order (e.g. `SIA`).
- **Every path is tagged with one primary RIASEC letter.**
- A path is highlighted in **gold** when its letter appears in the user's top-three code, sorted by how high that letter sits in the user's profile. All other paths remain fully selectable.

All six dimension scores are stored (not just the code) so recommendations can be ranked and the profile re-explained later.

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| **Frontend** | **Next.js 15** (React + TypeScript) | First-class RTL/i18n, server components for fast portal pages, clean component model. |
| **UI** | **Tailwind CSS** + **shadcn/ui** | Modern, clean look without a hand-rolled design system; themes cleanly to the navy/gold palette; full RTL. |
| **i18n** | **next-intl** | Arabic-first locale, RTL, message catalogs. |
| **Backend** | **NestJS** (Node.js + TypeScript) | Dedicated, opinionated API. Modular architecture suits the integration layer, background jobs, RBAC across three portals, and audit needs of a government system. |
| **Database** | **PostgreSQL** + **Prisma ORM** | Robust system of record; type-safe queries; shared types with the app. |
| **Jobs / cache** | **Redis** + **BullMQ** | Scheduled Moodle completion sync and certificate generation. |
| **PDF** | **Headless Chromium (Puppeteer)** HTML→PDF | Most reliable route to correct Arabic RTL shaping for certificates and CVs. |
| **LMS** | **Moodle 4.5 LTS** + Web Services (REST) + Catalyst RESTful plugin | LTS supported to late 2027; RESTful plugin returns real HTTP status codes instead of always-200. |
| **Auth** | App as identity provider (email/password, verified); JWT/session | Moodle handoff via token mapping (MVP); OAuth2 / AD-LDAP as hardening target. |

TypeScript end to end means the RIASEC and path domain types are shared between frontend and backend.

---

## 4. Architecture

A **decoupled frontend + dedicated backend**, with Moodle isolated behind a single anti-corruption module so an LMS change touches one place.

```
┌──────────────────────────────────────────────────────────────────┐
│                         Browser (RTL, Arabic)                       │
│   Next.js 15 · Tailwind · shadcn/ui · next-intl                      │
│   User portal  ·  Entity portal  ·  Super-admin portal              │
└───────────────────────────────┬────────────────────────────────────┘
                                 │  HTTPS (JSON API, JWT/session)
┌───────────────────────────────▼────────────────────────────────────┐
│                        NestJS API (TypeScript)                      │
│  Modules:                                                           │
│   • auth            (email/password, verification, RBAC)           │
│   • assessment      (RIASEC scoring → Holland Code)                │
│   • paths           (definitions, riasec_letter, 5–10 rule)        │
│   • courses         (catalog cache + product metadata)             │
│   • enrollment      (path confirm → Moodle enrol)                  │
│   • completion-sync (scheduled job, pass threshold, reuse)         │
│   • certificates    (idempotent issuance, PDF)                     │
│   • cv              (builder + PDF export)                          │
│   • moodle          (anti-corruption layer — ALL Moodle calls)     │
│   • admin / entity  (management + review)                          │
│   • audit           (government-grade logging)                     │
└───────┬───────────────────────┬───────────────────────┬────────────┘
        │                       │                        │
┌───────▼───────┐     ┌─────────▼─────────┐    ┌─────────▼──────────┐
│  PostgreSQL   │     │   Redis + BullMQ  │    │  Chromium (PDF)    │
│  (Prisma)     │     │  sync & cert jobs │    │  certs & CVs       │
└───────────────┘     └─────────┬─────────┘    └────────────────────┘
                                │  REST (wstoken, least privilege)
                      ┌─────────▼──────────┐
                      │   Moodle 4.5 LTS   │
                      │  Web Services API  │
                      │  (courses, quizzes,│
                      │   grades, complete)│
                      └────────────────────┘
```

**Principles**
- **Single source of truth per concern:** Moodle owns course content + raw completion/grades; the app owns assessment, paths, membership, and certificates.
- **One-directional completion flow:** Moodle → `completions` table → certificate logic.
- **Moodle isolation:** every Moodle call goes through the `moodle` module; nothing else in the codebase knows Moodle exists.
- **Idempotency everywhere sync touches:** repeated polling must never create duplicate certificates or enrollments.

---

## 5. Moodle integration

**Setup**
- Enable Web Services + REST; install the Catalyst RESTful plugin for proper HTTP status codes.
- Create a dedicated integration user + role with **least-privilege** capabilities.
- Define an external service listing only the functions used; generate a **token** stored server-side (never in the browser).

**Functions relied upon**
- `core_user_create_users` — provision a Moodle user on registration; store `moodle_user_id`.
- `core_course_get_courses` / `core_course_get_contents` — sync catalog metadata into the cached `courses` table.
- `enrol_manual_enrol_users` — enroll on path confirmation.
- `core_completion_get_course_completion_status`, `gradereport_user_get_grade_items` — completion + quiz grade.
- `core_webservice_get_site_info` — health/token check.

**Auth / SSO**
The app is the identity owner. On registration it creates the Moodle counterpart and stores `moodle_user_id`. Course entry uses a token-mapped **auto-login handoff** so users never see a second login. Hardening target: app as an **OAuth2 identity provider** (or point both systems at ministry **AD/LDAP** if it exists — confirm early, it reshapes auth).

**Course delivery**
MVP: **handoff** to an Arabic/RTL-themed Moodle, app remains the hub. Later: embedding once the flow is proven.

**Completion → certificate loop**
A **scheduled sync job** polls Moodle for enrolled users every few minutes, writes `completions`, evaluates the product pass threshold, honors shared-course reuse, then issues certificates idempotently — course certificate on a passed course, path certificate when all chosen courses are passed. Webhooks are a later optimization.

> Security note: keep `zend.exception_ignore_args` enabled and stay on a patched Moodle 4.5.x — unauthenticated REST data-exposure issues have been found in older 4.5 builds (CVE-2025-32044, fixed in 4.5.3).

---

## 6. Data model

The app database references Moodle by ID and never duplicates content.

| Table | Purpose |
|---|---|
| `users` | email, password_hash, full_name, employee_id, department, email_verified, **`moodle_user_id`** |
| `assessments`, `assessment_questions`, `assessment_options`, `assessment_responses` | the test; each option carries RIASEC dimension weights |
| `assessment_results` | all six RIASEC scores + derived Holland Code + timestamp |
| `paths` | name_ar, description, duration, **`riasec_letter`** |
| `courses` | **`moodle_course_id`**, cached title/description/duration + product metadata (path membership, ordering) |
| `path_courses` | many-to-many paths ↔ courses |
| `user_paths` | the user's single chosen path (building / active / completed) |
| `user_path_courses` | the specific 5–10 selected courses, per-course status |
| `enrollments` | maps user_path_course → Moodle enrollment (debug) |
| `completions` | synced from Moodle: grade, pass/fail, timestamp — drives certificates |
| `certificates` | issued by the app (course/path), idempotent, PDF reference |
| `cv_profiles` | CV builder data; certifications pulled from `certificates` |

---

## 7. Portals & pages

Three portals share the backend and design system.

### User portal (employee) — primary focus
- **Registration & Sign-in** — email/password, verification, forgot-password.
- **Dashboard** — three states: pre-assessment (single "start assessment" CTA), assessed-no-path ("choose your path"), active-path (continue card + path progress + quick tiles).
- **Assessment** — RIASEC questions, progress, no score dump.
- **Results & Path Selection** — Holland Code + description; gold-highlighted, rank-ordered recommended paths; all paths selectable.
- **Path detail / build** — select 5–10 courses; hard-commit confirmation.
- **Courses catalog** — browse/filter/search all courses.
- **Course detail** — full info + single context-dependent action.
- **Course view/player** — Moodle content + outcome handling.
- **My Path** — ordered courses, statuses, path certificate slot.
- **Certificates** — gallery, view/download PDFs.
- **CV Builder** — pre-filled, editable, PDF export.
- **Profile / Settings** — minimal.

Steady-state nav: Dashboard · Courses · My Path · Certificates · CV · Profile.

### Entity / reviewer portal
Publish Moodle courses into the catalog with **path membership, RIASEC tag, ordering**; review enrolled learners' progress and completions (scoped to their own courses).

### Super-admin portal
Manage users, paths (and their RIASEC letters), the assessment (questions/weights, versioning), system settings (pass threshold, sync interval), certificate templates, and global + integration-health dashboards.

*(Full page-by-page content specs live in `CLAUDE.md`.)*

---

## 8. Design system

Modern, clean, calm — generous whitespace, restrained accents, one clear action per screen. Gold is scarce so it keeps its "recommended / achievement" meaning.

| Token | Hex | Use |
|---|---|---|
| Primary Navy | `#222E42` | top-level surfaces, headers, sidebar |
| Secondary Navy | `#2E3A50` | nested surfaces |
| Primary Gold | `#A8863C` | recommended-path highlight, achievement accents |
| Light Gold | `#C9A85C` | gold hover/secondary states |
| Background Cream | `#F4F3F1` | app background |
| White | `#FFFFFF` | cards / content surfaces |
| Muted Blue | `#5E6B85` | secondary text, borders, quiet UI |

Rules: no redundant UIs or unnecessary buttons; a single primary action per screen; context-dependent buttons (show only the one that applies); ~6 steady-state nav items; RTL and Arabic typography treated as first-class.

---

## 9. Development phases

Built strictly in order; each ends with a user-approved test → PR (never merged by the agent). Each phase has explicit deliverables and a "done when" criterion in `CLAUDE.md`.

| Phase | Focus |
|---|---|
| **0 — Foundations** | Skeleton, RTL/i18n, design tokens, auth + email verification, user model, mocked Moodle service, CI |
| **1 — Assessment (RIASEC) + path core** | RIASEC questions + scoring → Holland Code, gold ranked results, letter-tagged paths, catalog + detail (mock), 5–10 build + single-path commit, dashboard states, My Path |
| **2 — Moodle integration** | Spike first; web services, provisioning, catalog sync, enrollment, scheduled completion sync + pass threshold + shared-course reuse, auth/SSO, course player |
| **3 — Certificates + CV** | Idempotent course/path certs, Arabic PDF solved, gallery, CV builder + export |
| **4 — Entity / reviewer portal** | Roles, course publishing + path/RIASEC tagging + ordering, learner review, scoping |
| **5 — Super-admin portal** | User/path/assessment/settings/certificate-template management, global + integration-health dashboards |
| **6 — Hardening** | Arabic QA, RTL PDF polish, security review, sync reliability + load, a11y, states |
| **7 — Deployment, acceptance & launch** | Deploy app + Moodle, seed data, full end-to-end acceptance, docs/handover, sign-off |

---

## 10. Working agreement (git & context files)

- **Never push or merge to `main`.** Work on feature branches `phase-<n>-<slug>`.
- Open a **pull request** to `main` only **after the user approves the test** for that work; a human reviews and merges.
- **Definition of Done** (every task): meets the phase's "done when"; Arabic-first/RTL and on-brand; rules enforced client + server; loading/empty/error states present; WCAG 2.1 AA; tests written and passing (unit + integration + an e2e happy path, plus explicit RIASEC scoring tests); typecheck + lint clean. CI runs lint + typecheck + tests on every PR. Commits follow Conventional Commits.
- Read order every session: **`CLAUDE.md` → `progress.md` → `decisions.md`** (as needed).
- **Update `progress.md` every session** and **`decisions.md`** whenever a decision is made or changed. This lets a fresh session (or cleared chat) resume with full context.

---

## 11. Getting started

> Detailed setup is defined during Phase 0. High-level shape:

**Prerequisites:** Node.js LTS, PostgreSQL, Redis, a Moodle 4.5.x instance (or the local mock used until Phase 2).

```
apps/
  web/     → Next.js 15 frontend (RTL, next-intl, Tailwind, shadcn/ui)
  api/     → NestJS backend (Prisma, BullMQ, moodle module)
packages/
  types/   → shared TypeScript domain types (RIASEC, paths, certificates)
CLAUDE.md  progress.md  decisions.md
```

**Environment (indicative):** database URL, Redis URL, JWT/session secret, SMTP (email verification), and the Moodle base URL + web-services token (server-side only). Until Phase 2, the app runs against the mocked Moodle service so the full product can be built before a live Moodle is wired.

---

*Built Arabic-first for the Ministry of Internal Affairs.*
