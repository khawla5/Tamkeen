# CLAUDE.md — Ministry Internal Training & Career Development Platform

> This file is the **source of truth for rules and context**. Read it fully at the start of every session.
> It works together with two companion files:
> - **`progress.md`** — the running log of what has been implemented. **Read this immediately after this file** to know the last thing done and continue from there.
> - **`decisions.md`** — the rationale behind non-obvious choices. **Consult this whenever you need to understand *why* something is the way it is** before changing it.
>
> **At the end of every working session (every meaningful output), you MUST update `progress.md` and, if any decision was made or changed, `decisions.md`.** This is how the project survives a cleared chat or a new session. Treat it as mandatory, not optional.

---

## 0. How to work in this repository (READ FIRST, EVERY SESSION)

1. **Read `CLAUDE.md` (this file) → then `progress.md` → then, if needed, `decisions.md`.**
2. Determine the current phase and the last completed task from `progress.md`.
3. Do the work for the current step only. Do not jump ahead across phases.
4. **Never push or merge to `main` directly. Never commit directly to `main`.**
5. When a phase (or a clearly-scoped sub-task the user approved) is complete **and the user has approved the test**, create a **new branch** and open a **pull request** against `main`. Wait for human review. Do not merge it yourself.
6. **Before ending the session, update `progress.md`** with what was done, what's next, and any blockers. Update `decisions.md` if a decision was made or revised.
7. If anything in `progress.md` conflicts with this file, **this file wins** for rules; `progress.md` wins for "what has actually been built so far."

### Git / PR rules (strict)
- Work happens on feature branches named `phase-<n>-<short-slug>` (e.g. `phase-1-assessment-core`).
- One PR per completed, approved phase or sub-task. PR description must summarize what was built, how it was tested, and link the relevant `progress.md` entry.
- **Do not merge. Do not push to `main`. Do not force-push shared branches.**
- Only open the PR **after the user has approved the test** for that work.

---

## 1. What this system is

An **Arabic-first** internal web platform for a government **Ministry of Internal Affairs**. Ministry employees:
1. Take a short **Holland (RIASEC) career assessment** (~20–30 questions).
2. Receive a **Holland Code** result — a ranked profile whose **top three letters** form the code (e.g. "SIA"). See §4A for the RIASEC framework.
3. Every **career path is tagged with a primary RIASEC letter**. Paths whose letter appears in the user's top-three code are shown as **recommended** (highlighted — the primary border plus a "موصى به" badge, D-069; historically called "gold"), ranked by how high that letter sits in the user's profile.
4. **Choose one path** — they may pick a recommended path or any other path. **A user commits to exactly one path and cannot switch it** once confirmed.
5. **Build** their path by selecting **between 5 and 10 courses** from the courses belonging to that path.
6. Work through the courses. Each course's content and quiz live in **Moodle** (integrated LMS).
7. Passing a course's quiz (at/above the product-defined threshold) earns a **course certificate**.
8. Completing the whole path (all chosen courses passed) earns a larger **path certificate**.
9. Build a **CV** pre-filled from their profile and earned certificates.

There are also (later phases) an **entity/reviewer portal** (organizations that author courses in Moodle and review learners) and a **super-admin portal**. The current focus is the **main user (employee) portal**.

### Core hierarchy
`Holland assessment → Holland Code (top-3 RIASEC letters) → Paths tagged by RIASEC letter (recommended if letter ∈ user's code, else free choice) → 5–10 Courses → Quizzes → Certificates (course + path)`

### The Moodle mental model
**Your app is the experience/logic layer; Moodle is the learning engine.**
- **Your app owns:** users & auth (email/password), the **Holland (RIASEC) assessment and its per-dimension scoring → Holland Code logic**, path definitions (each tagged with a RIASEC letter) and path membership, the 5–10 selection rule, path/course state, certificate issuance (as PDFs from your Arabic templates), the CV builder, and all Arabic-first UX.
- **Moodle owns:** actual course content delivery, quizzes, grading, and per-course completion signals.
- **The only bridges** between the two are `moodle_user_id` and `moodle_course_id`. Course content is **never authored in two places** — Moodle is the source of truth for course existence/content; your DB caches metadata and layers product metadata (path membership, ordering) on top.
- **Completion flows one direction:** Moodle → your `completions` table → certificate logic.

---

## 2. Non-negotiable product rules

- **Arabic-first.** Arabic is the default and primary language. Full **RTL** layout everywhere. This is an architecture decision set in Phase 0, not a late styling pass. Dates, numerals, and all UI copy default to Arabic. English can be a later add-on but never at the expense of the Arabic experience. **Certificate and CV PDF rendering must correctly render Arabic (RTL, proper shaping).** This is a known hard problem — handle it deliberately.
- **One path per user, no switching** once confirmed. The confirm step is a hard commitment gate and must show an Arabic confirmation dialog making this explicit.
- **5–10 courses.** A path cannot be confirmed with fewer than 5 or more than 10 courses. Enforce on both client and server.
- **One Moodle course can belong to multiple paths** (a modeling fact, so the same course isn't duplicated per path). **Under the current single-path rule, a user only ever works one path, so shared-course "reuse" rarely triggers in practice.** Still implement completion keyed by `(user, moodle_course_id)` so that IF a course ever appears reachable to a user through more than one route, an existing completion is reused and never re-taken. Do not build elaborate cross-path machinery beyond this key.
- **Assessment retake policy (LOCKED):** a user MAY retake the assessment and get a new Holland Code **only while they have NOT confirmed a path**. **Once a path is confirmed, both the path and the assessment result are locked** — no retake, no new recommendations, consistent with one-path-no-switching. Surface this in the UI (a retake option exists pre-commitment; it disappears after).
- **Course changed/unpackaged after selection (LOCKED):** entities may edit courses, but a course that is **part of any user's confirmed path may not be deleted/unpublished** — it can only be superseded/hidden from *new* selections. Users mid-path keep the version they enrolled in until they complete it. The catalog distinguishes "available to add" from "still completable if already enrolled."
- **Registration policy (LOCKED, confirm with ministry):** default assumption is **ministry-provisioned / restricted registration** — either accounts are pre-created by admins, or self-registration is gated by an allowed email domain and/or a valid employee ID. Do NOT ship open public registration. (If the ministry wants pure admin-provisioning, that's a settings toggle.)
- **Digits & dates (LOCKED):** UI uses **Arabic (Hijri optional) date presentation and Western Arabic numerals (0-9) by default**, with a single locale switch point so Arabic-Indic numerals (٠-٩) can be enabled without code changes. Pick one default in Phase 0 and keep it consistent everywhere (UI, certificates, CV, PDFs).
- **Recommendation, not restriction.** Recommended paths are highlighted (primary border + "موصى به" badge — D-069 retired the gold treatment) and sorted first, but every other path is fully selectable.
- **Certificate issuance is idempotent.** Because completion is polled, always check "already issued?" before creating a certificate. No duplicates.
- **Pass threshold is a product setting** in your system config, evaluated against Moodle's returned grade. Do not hardcode it into Moodle.
- **Email/password auth only.** No social login. Email verification on registration. This is an internal ministry system — treat security seriously (hashed passwords, secure sessions, least-privilege Moodle integration token).
- **Certificate verification (LOCKED):** every issued certificate carries a **unique verification ID** and a **QR code / public verification URL** so a third party can confirm authenticity (name, path/course, date) without logging in. Verification page shows only what's needed to confirm validity — no extra PII.
- **Notifications (LOCKED, minimal):** transactional email for: email verification, password reset, course passed, path completed / certificate ready. Keep them short, Arabic-first. No marketing, no engagement nagging. In-app: a light indicator when a new certificate is issued. Nothing more.
- **Security & privacy baseline (government context):** hash passwords (argon2/bcrypt), secure/httpOnly session or JWT handling, CSRF protection, input validation on every endpoint, rate-limiting + brute-force lockout on auth endpoints, least-privilege everywhere, secrets only server-side. **Audit-log** security-relevant and data-changing actions (login, path confirm, certificate issue, admin/entity changes) with who/what/when. Treat employee data as PII: collect the minimum, define a **data-retention** stance, and don't expose PII in logs, URLs, or the verification page.

---

## 2A. Tech stack & architecture (LOCKED — see decisions.md D-013)

- **Frontend:** Next.js 15 (React + TypeScript), Tailwind CSS, shadcn/ui, `next-intl` for Arabic-first RTL i18n.
- **Backend:** **NestJS** (Node.js + TypeScript) as a **dedicated API** — not Next.js route handlers. Organized into modules: `auth`, `assessment`, `paths`, `courses`, `enrollment`, `completion-sync`, `certificates`, `cv`, `moodle`, `admin`/`entity`, `audit`.
- **Database:** PostgreSQL + Prisma ORM.
- **Async/jobs:** Redis + BullMQ (scheduled Moodle completion sync, certificate generation).
- **PDF:** headless Chromium (Puppeteer) HTML→PDF — chosen for correct Arabic RTL shaping in certificates and CVs.
- **LMS:** Moodle **4.5 LTS**, Web Services (REST) + Catalyst RESTful plugin.
- **Shared types:** a `packages/types` workspace shares RIASEC/path/certificate types between frontend and backend.

**Architectural rules:**
- **All Moodle access goes through the single `moodle` module** (anti-corruption layer). No other code knows Moodle exists. An LMS change must touch only this module.
- The Moodle web-services **token is server-side only**, never exposed to the browser.
- **Idempotency** wherever sync touches (no duplicate certificates/enrollments from repeated polling).
- **One source of truth per concern:** Moodle owns course content + raw completion/grades; our DB owns assessment, paths, membership, certificates. Completion flows one direction (Moodle → `completions` → certificate logic).
- Suggested monorepo shape: `apps/web` (Next.js), `apps/api` (NestJS), `packages/types` (shared). Confirm/finalize in Phase 0.

---

## 2B. Engineering standards & definition of done (LOCKED — see decisions.md D-014)

These apply to **every** phase. A phase/task is not "done" until it meets all of these, and only then is it eligible for the user-approved-test → PR step.

**Testing (this is what "the test" in the git rules means):**
- **Backend:** unit tests for business logic (RIASEC scoring, 5–10 rule, pass-threshold evaluation, idempotent certificate issuance, path-commit locking) + integration tests for API endpoints. The **Moodle module is tested against the mock**, and the mock must implement the **same interface/contract** as the real Moodle module so the swap in Phase 2 changes only the implementation, not callers.
- **Frontend:** component tests for the key flows (assessment, results/recommendation ranking, path build counter, dashboard states) + at least one end-to-end happy-path test per phase's user-visible flow.
- **RIASEC scoring must have explicit test cases** covering ties, a clear top-three, and the recommendation-matching + ranking logic — this is core product correctness.
- Do not open a PR with failing or skipped tests. CI runs lint + typecheck + tests on every PR.

**Definition of Done (per task):**
1. Meets the phase's "done when" criterion (§7).
2. Arabic-first / RTL correct; on-brand (color tokens); no redundant UI.
3. Enforces all relevant product rules (§2) on **both client and server** where applicable.
4. Every data view has explicit **loading, empty, and error states** — no dead blank screens, no unhandled failures.
5. Accessible: semantic markup, keyboard navigable, sufficient contrast, correct `lang`/`dir`, labelled inputs. Target **WCAG 2.1 AA** (government obligation).
6. Tests written and passing (above); typecheck + lint clean.
7. `progress.md` updated (and `decisions.md` if a decision was made).

**Conventions:**
- Branches: `phase-<n>-<slug>` (e.g. `phase-1-riasec-scoring`).
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`) with clear scope.
- PR description: what was built, how it was tested, the "done when" it satisfies, and a link to the `progress.md` entry.
- No secrets in the repo; use `.env` (with a committed `.env.example`). Config via environment.

---

## 3. Brand & UI system

**Design system (LOCKED — D-069): the DGA's Platforms Code (كود المنصات), adopted in full.** Source of truth: `design.dga.gov.sa` and the official Figma library. The runtime tokens live in `apps/web/src/app/globals.css`; the data mirror and the AA proof live in `apps/web/src/lib/tokens.ts` / `contrast.test.ts`. Only the scale steps the UI consumes are declared — add a step there deliberately, never an ad-hoc hex in a component.

| Role | Token(s) | Hex |
|---|---|---|
| Primary (actions, links, focus, active nav) | `primary-600` · hover `primary-700` · dark `primary-800` | `#1B8354` · `#166A45` · `#14573A` |
| Primary tints | `primary-50` / `100` / `200` | `#F3FCF6` / `#DFF6E7` / `#B8EACB` |
| Recommended / achievement (same accent) | `primary-600` edge · `primary-700` text · `primary-50` fill with `primary-800` | `#1B8354` · `#166A45` · `#F3FCF6` / `#14573A` |
| Button states | primary `600 → 700 → 900`; destructive `danger-600 → danger → danger-900` | `#1B8354 → #166A45 → #104631`; `#D92C20 → #B42318 → #7A2619` |
| Display text · paragraph · secondary text | `neutral-800` · `neutral-700` · `neutral-500` | `#1F2A37` · `#384250` · `#6C727E` |
| Dark surface (landing footer) · nested | `neutral-900` · `neutral-800` | `#111927` · `#1F2A37` |
| Page ground · card · border | `neutral-50` · `surface` · `neutral-300` | `#F9FAFB` · `#FFFFFF` · `#D2D6DB` |
| Status (text/border, with a `-50` fill each) | `success` · `info` · `warning` · `danger` | `#067647` · `#175CD3` · `#B54707` · `#B42318` |

**Usage guidance:**
- Primary green for every action, link, focus ring and the active nav item; the dark neutral only for the landing footer — **the portal navigation is light** (white rail, primary start-edge bar on the active item — D-097/TAM-117); never green as a large surface.
- **One accent.** Platforms Code's gold secondary is deliberately NOT used. The recommended-path highlight is the `primary-600` border **plus the "موصى به" badge** (never colour alone — WCAG 1.4.1); achievements (certificates, the path seal) use the primary and its deep step. Keep the highlight scarce so it keeps signaling "recommended".
- **Buttons follow Platforms Code's state model** (default → hovered → pressed) — see `components/ui/button.tsx`; no gold/achievement button variant exists.
- Neutral-50 is the app ground; white for cards and content surfaces; neutral-300 for hairline borders (controls identify themselves by label and focus ring, not by border).
- Typeface: IBM Plex Sans Arabic (Platforms Code's own; self-hosted, D-023). Radius scale 4 / 8 / 16 / 24 — cards on 16.

**UI principles (hard rules):**
- **No redundant UIs. No unnecessary information or buttons.** Every screen shows only what is actionable now.
- Prefer a single clear primary action per screen.
- Context-dependent buttons: show only the one action that applies (e.g. a course shows *either* "أضف إلى مساري" *or* "ابدأ الدورة" *or* "مكتمل" — never all three).
- Keep steady-state navigation to ~6 items. Flow pages (assessment, results) are not permanent nav.
- **One navigation loader (D-093):** `NavigationProgress` in the root layout — a top progress bar for every page change, link or programmatic (`useAppRouter()` is the only router hook pages use). In-page data waits use `LoadingState` via `DataView`; never a second spinner for a navigation.

---

## 3A. Holland (RIASEC) assessment framework — how results map to paths

The assessment is a **Holland Codes / RIASEC** career-interest assessment. This defines both the assessment content and the recommendation logic. Do not reduce it back to a single opaque "letter."

### The six RIASEC dimensions
| Letter | Type (EN) | Type (AR) |
|---|---|---|
| **R** | Realistic | الواقعي |
| **I** | Investigative | البحثي / الاستقصائي |
| **A** | Artistic | الفني / الإبداعي |
| **S** | Social | الاجتماعي |
| **E** | Enterprising | المبادِر / الريادي |
| **C** | Conventional | التقليدي / التنظيمي |

### Scoring → Holland Code
- Each assessment question/answer contributes points to **one or more** of the six RIASEC dimensions. (Question authoring must map every option to its dimension(s) — this is a real content task, part of Phase 1.)
- Scoring **tallies points per dimension**, producing a **ranked profile** of all six letters.
- The user's **Holland Code = the top three letters**, in rank order (e.g. `S > I > A` → code "SIA").
- Store the full ranked per-dimension scores, not just the top three, so recommendations can be ranked and the profile can be re-explained later.

### Path tagging
- **Every path is tagged with exactly one primary RIASEC letter** (its `riasec_letter`). This is set when the path is defined (and, in later phases, editable by admins/entities).

### Recommendation rule (how the recommendation highlight works — LOCKED)
- A path is shown as **recommended** if its `riasec_letter` **appears in the user's top-three Holland Code**.
- Recommended paths are **ranked by how high their letter sits in the user's profile** (paths tagged with the user's #1 letter come first, then #2, then #3).
- All other paths (letters outside the top three) are still **available one click below** — normally styled and **fully selectable**, behind the collapsed "مسارات أخرى" toggle on Results (§4.4, D-113). The highlight is recommendation, not restriction. The treatment is the primary-600 border plus the "موصى به" badge (§3, D-069); "gold" in older decisions refers to this same highlight under the retired palette.
- The user still commits to **exactly one** path (see §2).

> If the product later wants stricter matching (only the single #1 letter) or looser matching, that is a change to this rule and must be recorded in `decisions.md`.

---

## 4. Pages of the main user portal (content spec)

> Build these in the user portal. Each entry lists purpose and required content. Do not add content beyond what's needed.

### 4.0 Public landing page (الصفحة الرئيسية العامة) — `/landing`, and `/` for signed-out visitors
- The only page an unauthenticated visitor sees besides auth. **Structure (LOCKED with the 2026-08-23 rebuild): Hero → "عن المنصة" explorer → FAQ → Footer.** No marketing sections (problem/trust/CTA strips were removed as such), no stats, no feature pills.
- **Hero:** ministry eyebrow, one-line title, one sentence, "إنشاء حساب" + "كيف تعمل المنصة" (jumps to the explorer), the BR-101 eligibility line; on the deep-green ground (`primary-deep`) with the ministry emblem above the Kingdom's map (13 named regions, decorative, animated, hover never touches `fill`).
- **Explorer:** Absher-style — four stage tabs (التقييم المهني / المسار التدريبي / الدورات / الشهادات والسيرة الذاتية), each stage's steps as a list, the selected step explained from the BRD's functional requirements with the single action "إنشاء حساب". A real `tablist`; steps are `aria-current` buttons.
- **FAQ:** six native `<details>`, answers are locked product rules only. **Footer:** identity (emblem + logo, الوزارة، الإدارة العامة للتدريب), the three real links (#about, /register, /login), policy names as plain text until their pages exist, © + classification.
- **Copy rules:** formal institutional register, specific nouns, no slogans, no symmetrical triplets; every number interpolated from config/constants. All copy is placeholder until الإدارة العامة للتدريب signs it off.

### 4.1 Registration & Sign-in (التسجيل / تسجيل الدخول)
- **Registration:** email, password, confirm password, full name, employee ID, department. Email verification link on submit. Minimal fields only.
- **Sign-in:** email + password, "forgot password". Nothing else.
- Single-column, centered, RTL, Arabic-first. No social login. **Built as `AuthLayout` (D-070):** owner header (emblem + logo + a visible exit to the landing page), one centred card with the emblem over the form, footer strip, decorative lattice. Registration is a two-step wizard (account → employee) with the department as a closed list. Forms use the shared Platforms Code primitives (`Input`, `Field`, `PasswordInput`, `Select`, `Alert`); axe (WCAG 2.1 A/AA) over the five pages is an e2e gate.
- After first sign-in → Dashboard (pre-assessment state).

### 4.2 Dashboard (الرئيسية) — two states
- **Every state (D-095):** a personal header (name · department · employee id) and a four-stage journey tracker; the last three things that happened, when any. Information, never a second primary action.
- **Pre-assessment:** one card briefly explaining the assessment (~20–30 questions, few minutes) + single primary button **"ابدأ التقييم"**. No empty widgets (no zero-of-zero progress bar). Nav at this stage: **Dashboard and Profile only** (D-071 — Courses appears once the assessment is done; a pre-assessment visit to any `/courses*` URL redirects to the dashboard).
- **Post-assessment, no path chosen:** main card says **"اختر مسارك"** with the Holland Code as Arabic chips, links to Results & Path Selection; below it the top three recommended paths as cards (D-095) with "عرض كل المسارات".
- **Post-assessment, path active:** the status strip (path name · type · مكتملة / قيد التنفيذ / لم تبدأ) + "continue where you left off" card (next course/quiz, one primary button) + progress bar ("X من Y دورات مكتملة") + the next courses with status + the latest certificate (or the locked slot) + compact tiles to My Path, Courses, Certificates, CV (D-095). Everything shown is actionable or is status.

### 4.3 Assessment (التقييم) — Holland/RIASEC
- One-line intro + start. Questions one at a time or in small groups, progress indicator, back/next.
- Each answer maps to one or more RIASEC dimensions (see §3A); scoring happens server-side.
- **No score dump.** On finish, compute the ranked per-dimension profile + top-three **Holland Code**, then transition directly to Results & Path Selection.
- **Shell and drafts (D-094):** the assessment renders inside the normal shell with the two-item pre-assessment nav (D-071); answers and the current question persist in `sessionStorage` (per tab, option ids only) so leaving mid-assessment and returning resumes in place; a changed bank discards the draft; submitting clears it.

### 4.4 Results & Path Selection (النتيجة والمسارات)
- Top: the user's **Holland Code** (the three letters with their Arabic type names, e.g. اجتماعي / بحثي / فني) + a short plain-language description (2–3 sentences) of what the code means. Optionally a compact visual of the six-dimension ranking.
- **Recommended paths are grouped by the letter that recommends them (D-113), one section per letter of the user's code, in the user's rank order:** "الأقرب إلى ميلك الأول — الاجتماعي" for #1, then "مناسب أيضًا — {type}" with a quiet "ميلك الثاني" / "ميلك الثالث" tag. **Paths whose `riasec_letter` is in the top-three code are rendered as recommended** (primary border + "موصى به" badge, D-069). A letter with no paths produces no heading. Ordering inside a group is the API's — never re-sorted in the browser.
- **Compact cards:** name, its RIASEC type, the "موصى به" badge, number of courses available, typical duration, one action. **The description is not on the card** — it lives on the path page the action opens.
- **Other paths (letters outside the code) sit behind one native `<details>` toggle, "عرض المسارات الأخرى (n)", collapsed on every visit** (D-113) — available one click below, fully selectable, never removed. §3A's _recommendation, not restriction_ is preserved.
- User must actively choose (the highlight is a recommendation, not a default selection).
- **After a path is confirmed (D-114):** the chosen path's card carries a "مسارك" marker (neutral, never the recommendation accent) and its one action becomes a link to مساري; **every other card loses its button entirely** — absence, not a disabled control (§3). The result card keeps working as the user's permanent Holland profile; the retake is already gone via `canRetake` (D-015).

### 4.5 Path detail / build (تفاصيل المسار)
- Path description at top, then the courses belonging to that path as selectable cards (title, short description, duration, "أضف" toggle).
- Persistent counter: "اخترت 4 من 5–10". Confirm button disabled until 5–10 selected.
- **Confirm = hard commitment** (Arabic confirmation dialog: one path, cannot switch). On confirm: lock path + course set, fire Moodle enrollment, go to My Path.

### 4.6 Courses catalog (الدورات)
- Global browse of all courses, **available once the assessment is done** (D-071; before that the catalogue is neither in the nav nor reachable by URL — the new user's one action is the assessment). The courses API itself stays open: reading catalogue data leaks nothing and every mutation is server-gated behind a confirmed path. Filters: path-type/category, duration; plus search.
- Card: title, short description, category, duration, path(s) it belongs to. Click → Course detail.

### 4.7 Course detail (صفحة الدورة)
- Full description, objectives, prerequisites, duration, path(s), certificate granted.
- **Single context-dependent primary action:** "أضف إلى مساري" / "ابدأ الدورة" / "مكتمل" (with certificate link). Show only the applicable one.

### 4.8 Course view / player (محتوى الدورة)
- Moodle content (handoff or embed). App contribution is thin: a header (course/path context), the Moodle material + quiz, and outcome handling: pass → certificate issued + return to path; fail → clear retake action. Do not rebuild Moodle chrome.

### 4.9 My Path (مساري)
- Path name + single progress bar. Ordered list of chosen courses with status (in progress / completed / next-up) and quiz result.
- Path certificate as a locked slot at the bottom, unlocking when all courses complete + passed.
- Optional, quiet action to add a course only if still under 10 and rules allow — must not compete with "continue."

### 4.10 Certificates (شهاداتي)
- Flat gallery: course certificates + the larger path certificate (visually distinguished). Each: title, date earned, view, download (PDF). Nothing else.

### 4.11 CV Builder (السيرة الذاتية)
- Form-based, pre-filled from profile + earned certificates (certifications auto-inserted). Editable sections: personal info, experience, education, skills. Live preview + export to PDF. One save, one export. No template zoo initially.
- **Language (LOCKED, D-050):** the CV is an **ENGLISH document (LTR)** — the builder chrome stays Arabic-first, but the CV content the user types and the exported PDF are English. System-injected proper nouns (name, department, path, RIASEC type names, certificate/course titles) **pass through as authored** (likely Arabic) — not translated, no English versions required. The PDF must render English body (LTR) with correctly-shaped inline Arabic runs. A fully-localized CV is a possible later addition; v1 is English-body with pass-through proper nouns.

### 4.12 Profile / Settings (الملف الشخصي)
- Personal/employee info, change password, email (verified; re-verify on change), language. Minimal.

**Steady-state nav:** Dashboard, Courses, My Path, Certificates, CV, Profile (6 items). Assessment & Results are contextual flow pages.

---

## 4A. Course-authoring model & cross-portal rules (LOCKED — see decisions.md D-046)

**Model 1 (LOCKED): entities author course CONTENT inside a themed Moodle; the portals wrap the PRODUCT layer around it.** We do NOT rebuild Moodle's authoring UI (lectures, videos, materials, quiz questions) inside our app — Moodle already does that well, and it mirrors the learner-side handoff (§5.4, D-045). The entity portal owns only what Moodle doesn't: product metadata (path membership, RIASEC letter, duration, objectives, prerequisites — consistent with D-035), publish/unpublish, and learner review. Entities create/edit actual content by being handed into Moodle via the same seamless-login handoff learners use (D-044/D-045).

**Course language (LOCKED, D-047):** each course exists in a SINGLE language as authored by the entity (Arabic OR English). The catalog shows each course's title/description in the language it was authored — we do NOT require or maintain both languages per course. App chrome stays Arabic-first regardless.

**Cross-portal linking (the experience must be continuous):**
- A course an entity PUBLISHES (with its path + RIASEC tag + product metadata) is exactly what appears in the learner's Courses catalog and path-build screen. Publishing is the bridge entity portal → user portal.
- Paths and the assessment configured in the super-admin portal drive what learners see in Results & Path Selection and path building.
- Course-edit protection (§2, D-015/D-040) is enforced across portals: a course in any user's confirmed path cannot be deleted/unpublished, only hidden from NEW selections (`HIDDEN_BUT_COMPLETABLE`) while enrolled learners finish; retired only when nobody holds it.
- All three portals share one backend, one design system (Platforms Code, RTL — D-069), one RBAC model (employee / entity / super-admin), and one audit log.

---

## 4B. Entity / Reviewer portal (content spec — Phase 4)

The portal for organizations that supply and own courses. RBAC-scoped: an entity sees ONLY its own courses and their learners (the data-scoping owed since D-027). Arabic-first, same design system.

### 4B.1 Entity Dashboard
At-a-glance: this entity's published/draft course counts, total enrolled learners, completion stats, anything pending, and a single "add a course" primary action. Only actionable items — no vanity widgets.

### 4B.2 My Courses
List of courses this entity owns, each showing status (draft / published / `HIDDEN_BUT_COMPLETABLE` / retired), enrolled-learner count, completion rate. Filter/search. Click → Manage Course.

### 4B.3 Add / Manage Course
The create + edit flow:
- Create the course shell, then be HANDED INTO MOODLE (seamless login, D-044) to author content — lectures, videos, materials, quiz + questions — using Moodle's own tools (Model 1).
- Back in the portal, set the PRODUCT metadata our app owns: path(s) the course belongs to, its RIASEC letter (consistent with the path), duration (product field, D-035), objectives, prerequisites, and course language (D-047).
- Publish / unpublish / hide — publish makes it appear in the learner catalog; unpublish/hide respects course-edit protection (can't strand mid-path learners).
- A clear "author content in Moodle" launch action keeps the seam smooth.

### 4B.4 Course Content (launch-to-Moodle)
Thin: a launch-into-Moodle button for authoring, plus a read-back summary of what Moodle holds (activities, quiz presence, completion criteria configured — the exact gap D-042 flagged) so the entity can confirm the course is actually completable before publishing. We do not rebuild Moodle's editor.

### 4B.5 Learners / Review
For THIS entity's courses only: enrolled learners, per-learner progress, quiz results, completions. Strictly RBAC-scoped. Optional flag/note. No other entities' data; no PII beyond what review requires.

### 4B.6 Entity Profile
Organization info and contacts. Minimal.

**Entity nav:** Dashboard, My Courses, Learners, Profile.

---

## 4C. Super-admin portal (content spec — Phase 5)

Central control. The admin does not just observe — they CONFIGURE the product itself (assessment, weightings, paths, settings). Arabic-first, same design system, full RBAC.

### 4C.1 Admin Dashboard
System-wide overview: user counts (employees + entities), active paths, completion rates, Holland-code distribution, and INTEGRATION HEALTH (Moodle reachable? sync healthy? — `core_webservice_get_site_info`). Recent activity. Actionable, not decorative.

### 4C.2 User Management
Manage employees and entities: view, activate/deactivate/suspend, assign roles, handle restricted-registration rules (D-017), create entity accounts, see a user's path/assessment/certificate status. No raw password access; every change audited.

### 4C.3 Assessment Management
Edit the Holland/RIASEC assessment: questions, options, and each option's RIASEC dimension WEIGHTINGS (§3A). Admins edit QUESTIONS and WEIGHTINGS — NOT the core scoring algorithm (LOCKED, D-048): the tally→rank→top-three-code logic is fixed in code (D-031/D-034); only inputs are editable.
- **Versioning (LOCKED, D-049):** editing the assessment must NOT retroactively change results of employees who already completed it. Existing `assessment_results` are FROZEN as taken — consistent with the append-only, restrict-on-delete model already built (D-033/D-035, `assessment_responses onDelete: Restrict`). Edits apply to FUTURE takers; surface version + effective date.
- The bank **balance** rule (D-032, `isBalancedBank`) must be respected: an edit that unbalances the six dimensions fails CI and must be rebalanced (or ranking moved to normalised percentages) — a deliberate decision, never a silent skew.
- Full loading/empty/error states; changes audited.

### 4C.4 Path Management
Create/edit study paths: name, description, duration, RIASEC letter (§3A). Manage `path_courses` membership, ordering, and — if ever made configurable — the 5–10 bounds. Retiring a path respects course-edit protection and doesn't strand learners on a confirmed path (D-002).

### 4C.5 Course Oversight
Global view across ALL entities' courses (admin sees everything; entities see only their own). Intervene (hide/retire a problematic course, correct metadata) — respecting course-edit protection (D-040).

### 4C.6 System Settings
The product knobs: pass threshold (D-007), completion-sync interval (D-042), registration policy + real allowed email domain / employee-ID format (D-017; placeholders today), digits/date default (D-018), notification settings, Moodle connection config (base URL; token server-side only). Changes audited.

### 4C.7 Certificate Templates
Manage the certificate look/template and ministry logo/seal + signature block. Because issued certificates store their rendered bytes (immutable), template edits affect only FUTURE issuances — state this in the UI.

### 4C.8 Audit & Reports
View the audit log (who/what/when) and system-wide reports: completion rates, popular paths, Holland-code distributions, certificate issuance. Read-only, exportable.

**Admin nav:** Dashboard, Users, Assessment, Paths, Courses, Settings, Certificate Templates, Audit/Reports.

---

## 5. Moodle integration (how it actually works)

### 5.1 Setup
- Enable Moodle **Web Services** + **REST protocol**.
- Create a dedicated **integration user + role** with least-privilege capabilities (create users, enrol, read completion/grades).
- Define an **external service** listing exactly the functions used; generate a **token**. Store it as a backend secret. **Never expose it to the browser.**

### 5.2 Functions relied upon
- `core_user_create_users` — create a Moodle user when someone registers; store returned id as `moodle_user_id`.
- `enrol_manual_enrol_users` — enroll on path confirm.
- `core_course_get_courses` / `core_course_get_contents` — sync catalog metadata (cached in your DB).
- `core_completion_get_course_completion_status` and `gradereport_user_get_grade_items` — completion + quiz grade.
- `core_webservice_get_site_info` — health/token check.

### 5.3 Authentication / SSO
- Your app is the identity owner (email/password). On registration, create the Moodle counterpart and store `moodle_user_id`.
- **MVP:** token-mapped **auto-login / session handoff** so the user never sees a second login when entering a course.
- **Auth is email/password only — no AD/LDAP, no external SSO** (LOCKED, D-019). The app is the sole identity owner and provisions Moodle accounts behind the scenes. The optional hardening target is app-as-OAuth2-IdP purely to smooth the Moodle handoff if ever needed; it is NOT a ministry SSO requirement.

### 5.4 Course delivery model
- **MVP:** **handoff** to a heavily Arabic/RTL-themed Moodle (strong RTL support), app remains the hub.
- **Later:** embedding inside Course view once the flow is proven.

### 5.5 Completion → certificate loop
- **MVP mechanism: scheduled sync job.** Backend polls Moodle completion/grade functions for enrolled users every few minutes. A few minutes' latency is acceptable.
- On detecting completion with grade ≥ product pass threshold: record in `completions`, mark the path-course complete, then **issue the course certificate (idempotent check first)**.
- When all of a user's chosen path-courses are complete + passed: **issue the path certificate (idempotent)**.
- Certificates are generated by **your app** (Arabic PDF templates), not Moodle's certificate plugin.
- **Later optimization:** replace/augment polling with webhook/event notifications.

---

## 6. Data model (your DB references Moodle by ID; never duplicates content)

- `users` — email, password_hash, full_name, employee_id, department, email_verified, **`moodle_user_id`**.
- `assessments`, `assessment_questions`, `assessment_options`, `assessment_responses` — the test, its questions, and each user's answers. **Each option maps to one or more RIASEC dimensions** (store the dimension weighting per option) so scoring can tally per dimension.
- `assessment_results` — per user: the **full ranked per-dimension RIASEC scores** (all six: R, I, A, S, E, C), the derived **Holland Code** (top-three ordered letters), and timestamp. Store all six, not just the code.
- `paths` — your path definitions: name_ar, description, typical duration, and **`riasec_letter`** (the single primary RIASEC letter the path is tagged with; drives the recommendation highlight).
- `courses` — thin mirror: **`moodle_course_id`**, cached title/description/duration + product metadata (path membership, ordering, **status: available / hidden-but-completable / retired**). Synced from Moodle.
- `path_courses` — many-to-many linking paths↔courses (a course may belong to multiple paths).
- `user_paths` — the user's single chosen path: user_id, path_id, status (building/active/completed), chosen_at. **Effectively one active record per user.** Enforces 5–10 at confirm.
- `user_path_courses` — the specific 5–10 courses selected, per-course status + enrollment reference.
- `enrollments` — optional explicit map user_path_course → Moodle enrollment (debugging syncs).
- `completions` — synced from Moodle: user, moodle_course_id, quiz grade, pass/fail, timestamp. **Unique on `(user, moodle_course_id)`** so re-sync is idempotent and any shared completion is reused. Drives certificate issuance.
- `certificates` — issued by your app: user_id, type (course/path), related course_id/path_id, issued_at, pdf reference, **`verification_id` (unique, public) + verification URL/QR payload**. **Idempotent issuance** (unique per user+type+target).
- `cv_profiles` — CV builder data per user (structured JSON sections ok); certifications pulled from `certificates`.
- `audit_log` — who/what/when for security- and data-relevant actions (login, path confirm, certificate issue, admin/entity changes). No PII in payloads beyond the actor/target IDs needed.
- `notifications` — in-app notification records (e.g. certificate issued); email sending is transactional and may be logged minimally. Keep minimal per §2.
- **Roles/permissions** — users carry a role (employee / entity / super-admin); entity records scope which courses/learners they can see. Backing tables per the RBAC foundation (Phase 0).

**Source-of-truth discipline:** Moodle owns course content + raw completion/grades; your DB owns assessment, paths, path membership, and certificates. Bridges are only `moodle_user_id` / `moodle_course_id`. Completion is one-directional (Moodle → your DB → certificate logic).

---

## 7. Development phases

> Build strictly in order. Each phase ends with: user-approved test → new branch → PR to `main` (never merged by you). Update `progress.md` at the end of every session and `decisions.md` on any decision.
> Each phase below lists its **goal**, **deliverables**, and a **"done when"** criterion. The phases together are designed to produce a **comprehensive, fully functional, launchable system** — not just isolated features. Do not consider the project complete until Phase 7 passes.

**Phase 0 — Foundations.**
*Goal:* a runnable skeleton with the cross-cutting concerns that are painful to retrofit.
*Deliverables:* project scaffold (monorepo per §2A); **Arabic-first RTL + i18n from day one**; the color system as design tokens/CSS variables; a component/layout shell (nav, page frame) that is RTL-correct **with loading/empty/error state primitives and base accessibility (WCAG 2.1 AA) conventions**; email/password **auth scaffolding + user model** (registration per the **restricted-registration policy** §2, email verification, sign-in, forgot-password, sessions/security basics **incl. rate-limiting + brute-force lockout**); **role/permission (RBAC) foundation** for the three portals; **audit-log foundation**; a **local mocked Moodle service that implements the exact same interface/contract as the real `moodle` module** (canned course data + completion) so Phase 2 swaps implementation only; **`.env.example` + config-via-environment**; DB migrations tooling; **decide the digits/date default** (§2); test harness + CI (lint + typecheck + tests on PRs).
*Done when:* a user can register (per policy, with email verification) and sign in, RBAC distinguishes the three portal roles, auth endpoints are rate-limited, the RTL dashboard shell renders with real loading/empty/error states, CI runs on a PR, and the mock Moodle service is callable through the shared contract.

**Phase 1 — Assessment (RIASEC) + path core.**
*Goal:* the product's identity — the full Holland flow end to end against the mock.
*Deliverables:* the **RIASEC assessment content** (~20–30 questions authored with each option mapped to its RIASEC dimension weighting — see §3A); the **scoring engine** (per-dimension tally → ranked profile → top-three **Holland Code**), persisted with all six scores; the **Assessment** flow pages; **Results & Path Selection** with **recommendation highlight + ranking** by the user's letter order; **paths tagged by `riasec_letter`**; **Courses catalog** + **Course detail** reading from the mock; **Path build** with the **5–10 rule** and **single-path hard commitment** (confirmation dialog); the **Dashboard's three states** (pre-assessment / assessed-no-path / active-path); **My Path** run view (statuses fed by the mock); **assessment-retake handling** (retake allowed only before path commitment, hidden after — §2).
*Done when:* a user can take the assessment, get a correct Holland Code, see correctly-highlighted-and-ranked recommended paths, pick one, build a 5–10 course path, confirm it, and see it in My Path — entirely against the mock.

**Phase 2 — Moodle integration proper.**
*Goal:* replace the mock with a real Moodle and prove the learning loop.
*Deliverables:* **spike first** — prove *enroll a user via API → they complete a course in Moodle → backend detects completion + grade*. Then: Moodle web services enabled + least-privilege integration token; **user provisioning** (`core_user_create_users`, store `moodle_user_id`); **catalog sync** from Moodle (`core_course_get_courses`) into the cached `courses` table with product metadata (path membership, `riasec_letter` via paths); **enrollment on path confirm** (`enrol_manual_enrol_users`); **scheduled completion-sync job** reading completion + grades, writing `completions` keyed by `(user, moodle_course_id)`, evaluating the **product pass threshold**, **idempotently** honoring existing completions (no re-take); **transactional email notifications** (course passed); **seamless Moodle login** so users never see a second login (token-mapped handoff; email/password only, no AD/LDAP per D-019); **Course view/player** (handoff to Arabic/RTL-themed Moodle).
*Done when:* a real user can, from the app, enter a real Moodle course, take its quiz, and have the app reflect completion + pass/fail automatically and idempotently (re-running the sync never double-processes).

**Phase 3 — Certificates + CV.**
*Goal:* the achievement + output layer.
*Deliverables:* **idempotent certificate issuance** — course certificate on passing a course's quiz, **path certificate** when all chosen courses are passed; **unique verification ID + QR/public verification page per certificate** (§2); **path-completed / certificate-ready notification**; **Arabic PDF rendering** solved (RTL, correct shaping) for certificates; **Certificates gallery** (view/download); **CV Builder** (form-based, pre-filled from profile + earned certificates, editable sections, live preview, **PDF export** with the same Arabic-PDF solution).
*Done when:* completing courses yields correct, non-duplicated Arabic certificates each with a working verification URL/QR; completing a whole path yields the path certificate; a user can build and export an Arabic CV pre-filled with their certifications.

**Phase 4 — Entity / reviewer portal.** (Full page spec: §4B. Authoring model + cross-portal rules: §4A.)
*Goal:* the organizations that supply courses and review learners — self-sufficiently, without code/DB edits.
*Deliverables:* entity accounts + RBAC data-scoping (an entity sees only its own courses/learners — closes D-027); the pages in §4B — Dashboard, My Courses, Add/Manage Course (Model 1: content authored in Moodle via seamless handoff; the portal owns product metadata — path membership, `riasec_letter`, duration, objectives, prerequisites (D-035), course language (D-047) — plus publish/unpublish), Course Content (launch-to-Moodle + a read-back that surfaces missing completion criteria per D-042), Learners/Review (scoped), Entity Profile; **course edit/unpublish protection** enforced (§2, D-040); publishing bridges to the learner catalog (§4A). Objectives/prerequisites become entity-editable here (owed since D-035).
*Done when:* an entity can create a course, author its content in Moodle via handoff, set its path + RIASEC + product metadata, publish it so it appears in the learner catalog, and review only its own learners' progress.

**Phase 5 — Super-admin portal.** (Full page spec: §4C.)
*Goal:* central control — the ministry runs and configures the whole product without touching code or the database.
*Deliverables:* super-admin account(s); the pages in §4C — Dashboard (incl. Moodle integration health), User Management (employees + entities), **Assessment Management** (edit questions + option RIASEC weightings, NOT the core algorithm — D-048; with **frozen-result versioning** — D-049; must keep the bank balanced — D-032), **Path Management** (create/edit paths, `riasec_letter`, `path_courses`, ordering), Course Oversight (global, D-040), System Settings (pass threshold, sync interval, registration policy + real ministry email domain/employee-ID format, digits/date, notifications, Moodle config), Certificate Templates (affects future issuances only — issued certs are immutable), Audit & Reports. Also completes the deferred Profile items — change-password, email re-verification, language switch (owed since Phase 1).
*Done when:* an admin can manage users, edit the assessment (questions + weightings) with existing results frozen and the bank still balanced, manage paths, configure system settings, manage certificate templates, and monitor system + Moodle health — all from the portal.

**Phase 6 — Hardening.**
*Goal:* production-grade quality for a government system.
*Deliverables:* full **Arabic content QA** across every page; **RTL + Arabic PDF polish**; **security review** (authn/authz, session security, secret handling for the Moodle token, input validation, audit logging, rate limiting, dependency review, **CVE check incl. Moodle ≥ 4.5.3 for CVE-2025-32044**, `zend.exception_ignore_args` on); **data-retention & privacy pass** (PII minimization, retention policy applied, PII absent from logs/URLs/verification page); **sync reliability** (retries, idempotency, failure alerting) and **load testing**; full **accessibility (WCAG 2.1 AA) pass**; error/empty/loading states verified everywhere.
*Done when:* security + privacy + Arabic + accessibility + reliability reviews pass with no open critical/high issues.

**Phase 7 — Deployment, acceptance & launch.**
*Goal:* a real, running, accepted system.
*Deliverables:* deployment setup for app + Moodle (environments, config/secrets management, **backups + restore drill**, monitoring/logging, **pinned Moodle 4.5.x ≥ 4.5.3** and an **Arabic/RTL-themed Moodle**); data migration/seed for real paths, courses, and the assessment; **end-to-end acceptance test of the full journey** (register → assess → Holland Code → pick path → build 5–10 → take Moodle courses → certificates + verification → CV) across user, entity, and admin portals; documentation/handover.
*Done when:* the full journey works in the target environment, backups restore cleanly, and the ministry signs off on acceptance.

---

## 8. Session checklist (do this every time)
- [ ] Read CLAUDE.md → progress.md → (decisions.md if needed).
- [ ] Identify current phase + last completed task.
- [ ] Do only the current scoped work.
- [ ] Keep it Arabic-first / RTL and on-brand (color tokens).
- [ ] Enforce product rules (5–10, one path, retake-pre-commit-only, idempotent certs, context-dependent buttons, no redundant UI) on client **and** server.
- [ ] Add loading/empty/error states; keep WCAG 2.1 AA.
- [ ] Meet the **Definition of Done** (§2B): tests written + passing, typecheck + lint clean, phase "done when" met.
- [ ] On approved completion: new branch (`phase-<n>-<slug>`) + Conventional-Commit PR to `main`. **Never merge/push to main.**
- [ ] **Update `progress.md`** (and `decisions.md` if a decision was made).
