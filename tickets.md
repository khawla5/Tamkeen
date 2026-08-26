# Tickets

> Format: **Title → Priority → Pre-requisite → Description**. Tickets sharing a label belong to the same epic.
>
> **Baseline:** all "verified" implementation notes were re-checked against `main` @ `f1f0dcd` (2026-08-23), which now includes Phase 3 (certificates + CV, PR #4), the public landing page (PR #5, built from the reference design), and Phase 4 (entity portal, PR #6). Phase 5 (super-admin) is next. Re-verify notes again if `main` moves before a ticket is picked up.
>
> **Epic label: `auth-ui-port`** — rebuilding the sign-in/sign-up screens (wired, functionality unchanged) for ministry requirements. **Re-based 2026-08-23 on the DGA's Platforms Code (see the `dga-alignment` epic): the design source is now the official Platforms Code templates/components, not the reference repo.** The reference repo (`AhmadIbrahiem/frontend`, `master`) remains useful only for the _interaction_ ideas already approved — the two-step registration wizard, input treatment — where Platforms Code has no prescribed pattern. Shared ground rules for every ticket in this epic:
>
> - Fully wired to the existing auth API — no functionality changes, restyle only.
> - **Email/password only. No SSO (real or mock), no social login, no demo accounts** (D-019 reaffirmed).
> - Arabic-first RTL, Tailwind **logical properties only** (`ms-`/`me-`/`ps-`/`pe-`/`text-start`…), directional icons mirrored.
> - Visuals: **Platforms Code tokens and components (TAM-115)** + IBM Plex Sans Arabic. If Platforms Code publishes a login/registration template, use it and note any deviation; the approved two-panel layout (TAM-101) applies only where the system prescribes nothing.
> - Western Arabic digits (D-018). WCAG 2.1 AA: focus rings, keyboard nav, semantic landmarks, labelled inputs. Responsive to 360px.
> - Keep existing routes (`/login`, `/register`), form labels, and error copy so the 256 web component + 34 e2e tests keep their anchors.
> - Motion: CSS-only short opacity fades behind `prefers-reduced-motion` — do **not** add framer-motion.
> - Definition of Done per CLAUDE.md §2B applies to every ticket (tests, typecheck, lint, states, a11y).
> - The auth pages are untouched by the landing PR (#5) — still `AuthCard` — and the current landing page is itself being replaced (TAM-116); do **not** match it.
>
> **Pre-requisite for the whole epic: TAM-115** (tokens). All work on branch `feature/auth-ui-port` off `main`. BRD §8.1 (BR-101–106) cross-check pending — the BRD document is still owed to the repo.

---

## TAM-101 — Auth shell: centred government template + DGA form primitives — **DONE** (`feature/tam-101-102-auth-shell-login`)

- **Labels:** `auth-ui-port`, `frontend`, `design-system`
- **Priority:** High (blocks every other ticket in the epic)
- **Pre-requisite:** TAM-115 (Platforms Code tokens) — stacked on `feature/dga-alignment`
- **What shipped (2026-08-23) — note the change from the original two-panel idea:** the two-panel split was the _reference repo's_ layout, exactly the source the epic stopped following. Government sign-in pages (Absher, Nafath, the DGA's examples) are **centred**: a slim header naming the owner, one card with the ministry emblem over the form, a footer strip, a quiet geometric lattice behind the page. So `AuthLayout` is that — and CLAUDE.md §4.1's "single-column, centred" **stands; no decision amendment was needed**. The header carries a visible exit ("← العودة إلى الصفحة الرئيسية") because a logo link is a convention, not a signpost.
- **Also shipped, app-wide:** the DGA form anatomy in the shared primitives — `Input` (36px, radius 4, neutral-400 edge, primary focus ring), `Field` (semibold label, required mark before the label but kept out of the accessible name, icon + text error row), new `PasswordInput` (show/hide toggle, `aria-pressed`, never submits) and `Alert` (status banners: error = assertive alert, success/info = polite status). Every form in the portal inherits this.
- **Acceptance met:** one `h1`; header/main/footer landmarks; pattern `aria-hidden`; no physical-direction classes, no retired tokens (tested); 9 `Field` accessibility tests unchanged and green.
- **Open:** whether Platforms Code publishes an official login template (official site unreadable from here) — if it does, reconcile; the decorative lattice is below AA on purpose.

## TAM-102 — Sign-in page restyle (wired) — **DONE** (`feature/tam-101-102-auth-shell-login`)

- **Labels:** `auth-ui-port`, `frontend`
- **Priority:** High
- **Pre-requisite:** TAM-101
- **What shipped:** `/login` on `AuthLayout` with the DGA primitives: `PasswordInput`, form-level messages as `Alert` (the unverified-email resend button lives inside the error alert), full-width primary submit, links in the primary. Behaviour untouched — `useErrorMessage` mapping, the `EMAIL_NOT_VERIFIED` resend branch, the role-based redirect (`ENTITY` → `/entity`), `dir="ltr"` on the email field, `noValidate`. Labels and error copy unchanged, so the e2e locators hold.
- **Acceptance met:** existing login tests pass unmodified; 297 web unit tests green; typecheck, lint, prettier.

## TAM-103 — Registration as a two-step wizard (wired) — **DONE** (`feature/tam-103-register-wizard`)

- **Labels:** `auth-ui-port`, `frontend`
- **Priority:** High
- **Pre-requisite:** TAM-101 + TAM-102 (done). **Own branch:** `feature/tam-103-register-wizard` off `feature/tam-101-102-auth-shell-login`.
- **What shipped (2026-08-23):** the two-step wizard as specified, plus — at the user's direction — **client validation on both steps** mirroring the server's rules (email shape, password length, full name ≥ 3 chars, employee id against `EMPLOYEE_ID_PATTERN`, a department chosen) with per-field error rows, and **الإدارة as a dropdown** (new native `Select` on the DGA field anatomy) fed by a shared `DEPARTMENTS` list — **placeholder until the ministry supplies the official list**; the server still accepts any non-empty department, tightening it to the list is a server change for when the list is real. Server errors return to the owning step (`STEP_FOR_ERROR`). The e2e suite was rewritten for the wizard (a `fillRegistration` helper; the login locators now `exact`, since the password toggle's name also contains "كلمة المرور"). 9 wizard unit tests; auth e2e green against the live app.
- **Description:**
  Rebuild `/register` inside `AuthLayout` as a two-step wizard, keeping the reference's step-wizard feel but **deleting the role picker**: **Step 1** account (email, password, confirm password) → **Step 2** employee details (full name, employee ID, department). Arabic step indicator ("الخطوة 1 من 2", western digits). Per-step client validation; one server submit at the end; back preserves entered values. Server-side rules (restricted domain, employee-ID pattern, password policy) untouched.
  A server error on submit must return the user to the step containing the offending field, with the field-level Arabic error shown.
  **Acceptance:** new unit tests for step validation, back/next value retention, and server-error → correct-step mapping; register e2e happy path updated for the wizard and green; verification email still flows through Mailpit.
  **Implementation notes (verified):** keep it ONE client component with local step state — no routing per step, so back/next retains values for free and the URL stays `/register`. Server submit only at the end via the existing `authApi`; error codes come from the shared `errors` catalogue via `useErrorMessage`, and each code maps to the step that owns its field (domain/email errors → step 1; employee-ID pattern → step 2). Step indicator uses `actions.back`/`actions.next` where possible and western digits (D-018). The e2e suite reads the verification token out of Mailpit — keep field labels unchanged so its label-based locators survive.

## TAM-104 — Secondary auth pages restyle: verify-email, forgot-password, reset-password — **DONE** (`feature/tam-104-auth-pages`)

- **Labels:** `auth-ui-port`, `frontend`
- **Priority:** Medium
- **Pre-requisite:** TAM-101, TAM-102 (reuses the restyled input components)
- **Description:**
  Move the remaining three auth screens (`/verify-email`, `/forgot-password`, `/reset-password`) into `AuthLayout` with the same input styling, so no page is left on the old `AuthCard` design. Single-card forms; functionality unchanged (single-use hashed tokens, enumeration-resistant responses).
  Remove `AuthCard` if nothing references it afterwards; otherwise note what still uses it.
  **Acceptance:** all three flows pass their existing tests; reset-password e2e (token from Mailpit) green; loading/empty/error states intact.
  **What shipped (2026-08-23):** all three on `AuthLayout` with the DGA primitives — `PasswordInput` on both reset fields, form-level errors as `Alert`, full-width actions, the single-use token and enumeration-safe behaviours untouched (asserted: forgot shows the same panel on failure; reset refuses a mismatch and a missing token before sending; verify calls the API once). **`AuthCard` is deleted** — nothing imports it. 7 new component tests; auth e2e (register → verify → sign in, domain refusal, mismatch) green against the live app.
  **Implementation notes (verified):** all three pages currently render through `AuthCard` (`src/components/auth/auth-card.tsx`) — after this ticket nothing should import it; delete it and its usages in the same PR so the old design can't resurface. The pages keep their enumeration-resistant behavior (always-report-sent responses) — restyle only.

## TAM-105 — Epic QA pass: RTL/a11y/responsive audit + docs — **DONE** (`feature/tam-105-auth-qa`)

- **Labels:** `auth-ui-port`, `qa`, `docs`
- **Priority:** Medium
- **Pre-requisite:** TAM-102, TAM-103, TAM-104
- **Description:**
  Close the epic: manual browser pass over all five screens at 360/768/1280px in RTL; keyboard-only walkthrough; contrast spot-checks on the navy panel (gold usage per the Phase 0 restriction); confirm no physical-direction classes slipped in (`grep -rE "\b(ml-|mr-|pl-|pr-|text-left|text-right|left-|right-)"` over the auth surface); `prefers-reduced-motion` honored.
  Cross-check BRD §8.1 BR-101–106 once the BRD is delivered — record any gaps as new tickets rather than absorbing scope.
  Update `progress.md` (including correcting the stale "Phase 2 PR awaiting review" — PR #3 is merged) and finalize the `decisions.md` entries. Then the epic is ready for the user-approved test → PR gate.
  **Acceptance:** full suite green (unit + integration + e2e), typecheck/lint/format clean, audit findings fixed or ticketed, docs updated.
  **What shipped (2026-08-23):** `e2e/auth-a11y.spec.ts` — axe (WCAG 2.1 A/AA) on all five pages, no horizontal overflow at 360/768/1280, the login keyboard order — 21 checks, all green, now a permanent gate (`@axe-core/playwright` added as a dev dependency). Screenshots at the three widths reviewed; one finding fixed (the header's exit link wrapped into the logos at 360px — now arrow-only below `sm`, full name via `aria-label`). Physical-direction grep over the auth surface: none. BRD §8.1 cross-check: BR-101 (ministry-scoped registration), BR-102 (verification), BR-103 (email/password only, no social), BR-104 (forgot flow), BR-105 (roles; login redirects by role), BR-106 (hashing, sessions, rate limit/lockout — the register limiter tripped during repeated e2e runs, as designed) all satisfied; BR-107 (directory/SSO) is explicitly future, confirming D-019. D-070 recorded; CLAUDE.md §4.1 updated.

---

> **Epic label: `assessment-gating`** — focusing the pre-assessment experience on the one action that matters: starting the assessment.

## TAM-106 — Hide Courses until the assessment is finished (sidebar + deep links) — **DONE** (`feature/tam-106-nav-gating`, off `feature/dga-alignment`)

- **Labels:** `assessment-gating`, `frontend`, `spec-change`
- **Priority:** High
- **Pre-requisite:** none (independent of the `auth-ui-port` epic)
- **Description:**
  Pre-assessment (`PRE_ASSESSMENT` dashboard state), the sidebar currently shows **الرئيسية + الدورات + الملف الشخصي**. Change it to show **الرئيسية + الملف الشخصي only** until the user finishes the assessment. The moment the assessment is done (`ASSESSED_NO_PATH`), Courses reappears; a confirmed path (`ACTIVE_PATH`) adds My Path as today.
  Deep links follow the same rule: a pre-assessment visit to `/courses` or `/courses/[courseId]` (any `/courses*` route) redirects to the dashboard, whose main card already carries the single "ابدأ التقييم" action. Nav and reality must not disagree.
  **This is a deliberate spec change** — CLAUDE.md §4.2 currently says pre-assessment nav is "Dashboard, Courses, Profile only" and §4.6 says the catalog is browsable "even pre-assessment". Amend both sections and record the decision in `decisions.md` (rationale: a brand-new user has exactly one meaningful action; a browsable catalog before any recommendation exists competes with it).
  **Server-side note:** the courses **API stays open** — viewing catalog data leaks nothing and every mutating action (add-to-path) is already server-gated behind a confirmed path. Record this scoping in the same decisions.md entry so "client and server" (§2) is answered deliberately, not skipped.
  **Acceptance:**
  - Sidebar shows exactly 2 items pre-assessment, 3 after assessment, 6 with an active path (Phase 3 added شهاداتي and السيرة الذاتية) — asserted in unit tests for `navForState`.
  - Pre-assessment navigation to any `/courses*` URL lands on the dashboard; post-assessment it renders the catalog normally.
  - New e2e step: fresh user sees only الرئيسية/الملف الشخصي; after submitting the assessment the sidebar gains الدورات without a reload.
  - CLAUDE.md §4.2/§4.6 amended; decisions.md entry added; progress.md updated.
    **What shipped (2026-08-23):** as specified — `navForState` returns two items pre-assessment; `PortalProvider` redirects `/courses*` to `/` for `PRE_ASSESSMENT` with the loading state shown; `nav-items.test.ts` updated (not duplicated); a new `portal-provider.test.tsx` pins the redirect (4 cases); the journey e2e asserts 2 items + the bounce before the assessment and الدورات appearing after it, and the two catalogue e2e flows now run post-assessment. CLAUDE.md §4.2/§4.6 amended; D-071 recorded.
    **Implementation notes (verified):**
  - The gate lives in ONE function: `navForState(state)` in `src/components/layout/nav-items.ts` — change `['dashboard', 'courses', 'profile']` for the `PRE_ASSESSMENT` branch only; the shell renders whatever list it is handed. The state is decided server-side (`DASHBOARD_STATES` in `packages/types/src/journey.ts`) and loaded once by `PortalProvider` — do not re-derive it in the page.
  - Put the redirect where `PortalProvider` already owns journey state (it handles the 401 redirect the same way): when state is `PRE_ASSESSMENT` and the route matches `/courses`, `router.replace('/')`. Render the loading state while redirecting — never a flash of catalog.
  - `navForState` now has a dedicated test, `src/components/layout/nav-items.test.ts` — it currently asserts `PRE_ASSESSMENT` → `['dashboard', 'courses', 'profile']`, so it will fail on this change by design. Update that assertion (and the `sidebar-nav.test.tsx` fixtures if they assume three items); do not add a second test file.
  - `PortalProvider` now also carries `unreadCertificates` and the shell renders a certificates indicator; the redirect added here must not interfere with that load — put it after the existing 401 handling, in the same effect.
  - Watch `e2e/journey-happy-path.spec.ts`: it asserts `/courses` URLs mid-journey (lines ~117, ~182). Those steps run post-assessment so they should survive, but verify rather than assume; the new pre-assessment assertions belong in the same spec so ordering is explicit.
  - The dashboard's pre-assessment card and copy need no change — it already presents the single "ابدأ التقييم" action (§4.2).

## TAM-107 — Sidebar during the assessment + resume-within-session drafts — **DONE** (`feature/tam-107-assessment-sidebar`)

- **Labels:** `assessment-gating`, `frontend`, `spec-change`
- **Priority:** High
- **Pre-requisite:** TAM-106 (the sidebar shown mid-assessment must be the gated two-item nav — without TAM-106 it would surface الدورات to a pre-assessment user)
- **Description:**
  While taking the assessment, the user can currently go nowhere: the page renders `chrome="bare"` — deliberately, with a recorded rationale ("showing the rail beside a step-by-step flow invites abandoning it midway"). Reverse that **for the assessment only**: it renders inside the normal shell, so الرئيسية and الملف الشخصي stay reachable mid-assessment. Results and path-build remain bare — they end in a decision and shouldn't invite wandering.
  Leaving mid-assessment must not cost the user their answers: draft answers and the current question index persist in **sessionStorage**, so navigating to the dashboard or profile and returning within the browser session resumes at the same question. Closing the browser still restarts — no server changes, nothing stored beyond Likert choices.
  Update the `chrome` rationale comment in `portal-page.tsx` and record the partial reversal in `decisions.md` (assessment gets chrome because its audience is exactly the user with a two-item nav and a legitimate reason to check their profile; results/path-build keep the original rationale).
  **Acceptance:**
  - Assessment page shows the sidebar with exactly the TAM-106 pre-assessment items (الرئيسية، الملف الشخصي), keyboard-reachable, RTL-correct.
  - Answer 10 questions → click الرئيسية → return to the assessment → question 11 is showing with all 10 answers intact (component test + e2e step).
  - Submitting the assessment clears the draft; a later retake starts clean at question 1.
  - A draft referencing question ids no longer in the bank is discarded silently (bank can be edited in Phase 5).
  - Results and path-build still render bare — asserted, not assumed.
    **What shipped (2026-08-23):** as specified. `chrome="bare"` removed from the assessment page (results and path build keep it; the rationale comment in `portal-page.tsx` rewritten); a sessionStorage draft keyed to the assessment id + question ids, written through on every answer/step, restored on mount, discarded when the bank differs, cleared on submit. 4 new component tests; the journey e2e now answers two statements, leaves to the profile via the sidebar, returns and resumes on statement 3 (`completeAssessment` gained a `from` parameter). Also fixed a leftover invalid class from the token migration on the option cards. D-073 recorded; CLAUDE.md §4.3 updated.
    **Implementation notes (verified):**
  - The chrome switch is one line: `src/app/(portal)/assessment/page.tsx` line ~34 passes `chrome="bare"` to `PortalPage` — remove it and the default `'nav'` chrome renders `AppShell` with `navForState(dashboard.state)`, which after TAM-106 yields the two gated items for `PRE_ASSESSMENT` automatically. No new layout code.
  - Draft state lives in `AssessmentFlow` (same file): `answers` (`Record<string, string>`) and `index` are plain `useState`. Hydrate them from sessionStorage on mount and write through on change; key by the assessment's question-id list so a changed bank invalidates the draft. Clear the key in the submit success handler (where it already calls `usePortal().refresh()` and routes to results).
  - sessionStorage is per-tab and per-origin: no PII concern (option keys only, no free text), nothing crosses users on a shared machine once the tab closes.
  - Guard the sessionStorage reads for SSR/first render (`typeof window`) — the page is a client component but hydration order still matters.
  - Retakes are allowed only pre-commitment (§2) and this draft mechanism doesn't change that — the retake path just starts with an empty draft after the previous submit cleared it.

## TAM-108 — Dashboard: Holland chips after the assessment + status strip on an active path — **DONE** (`feature/tam-108-dashboard`)

- **Labels:** `assessment-gating`, `dashboard`, `frontend`, `api`
- **Priority:** Medium
- **Pre-requisite:** none (independent of TAM-106/107; all three dashboard branches live in one file, so one ticket avoids two PRs colliding there)
- **Description:**
  Two of the dashboard's three states get a content change. The rule holding both together: **one primary action per screen; information may be added, competing actions and duplicated UI may not** (§3).

  **A. Assessed, no path yet (`ASSESSED_NO_PATH`).** Today the Holland Code appears as a raw Latin string inside a sentence ("ظهرت نتيجتك: RIA") — meaningless to an Arabic-speaking user. Replace it with the three letters as **styled chips carrying their Arabic type names in rank order** (strongest first), e.g. الواقعي، البحثي، الفني, reusing the existing `riasec.*` names. The card keeps its title ("اختر مسارك"), gains a short lead-in ("ميولك المهنية، مرتّبة من الأقوى:"), and keeps its **single** action → Results.
  _Explicitly rejected in discussion (do not add):_ per-chip one-line summaries (Results owns explanation), a recommended-paths preview (Results owns the gold ranking), a dashboard retake link (retake stays on Results, next to the ranking it would replace — D-015).

  **B. Path confirmed, in progress (`ACTIVE_PATH`).** The page shows a progress bar and the next course but never says **which path the user is on** or how their courses break down. Add a compact, non-interactive **status strip above the continue card**: a path tile (name + Arabic RIASEC type, e.g. "مسار تحليل البيانات · البحثي") and three count tiles — مكتملة / قيد التنفيذ / لم تبدأ. The continue card below stays the page's only action.

  ```
  ┌──────────────────────┐ ┌───────┐ ┌────────────┐ ┌────────┐
  │ مسار تحليل البيانات   │ │   4   │ │     1      │ │   2    │
  │ البحثي               │ │ مكتملة │ │ قيد التنفيذ │ │ لم تبدأ │
  └──────────────────────┘ └───────┘ └────────────┘ └────────┘
  ┌────────────────────────────────────────────────┐
  │ تابع من حيث توقفت — الدورة التالية: …             │
  │ ▓▓▓▓▓░░░░  4 من 7 دورات مكتملة                   │
  │ [ ابدأ الدورة ]                                  │
  └────────────────────────────────────────────────┘
  ```

  _Restraint is a requirement, not a style note._ The reference product's dashboard (screenshot on file) surrounds its summary with a journey stepper, KPI-percentage cards, a recommended-actions row and application/interview widgets. None of that is ported — most has no equivalent here and all of it violates §3. A journey stepper, if ever wanted, is its own discussion.

  **C. Before the assessment (`PRE_ASSESSMENT`)** — untouched.

  Approved mockups of all three states: the "Tamkeen Dashboard States" artifact (shared from Claude Code).

  **Acceptance:**
  - State A: three chips in profile rank order with Arabic names; the Latin code string appears nowhere on the dashboard; exactly one action (→ /results); no summaries, previews, or retake link; chips read as plain text in rank order to assistive tech.
  - State B: strip shows path name + Arabic RIASEC type + three counts that always sum to the path total; western digits via the shared number formatter (D-018); tiles are informational content, not fake buttons; wraps 2×2 at narrow widths, usable at 360px RTL; continue card unchanged and still the only action. The four link tiles below it (مساري، الدورات، شهاداتي، السيرة الذاتية — Phase 3 added the last two) are unchanged; the status strip must read as _status_, not as a fifth row of tiles — differentiate it (no hover affordance, no link styling).
  - State C unchanged. Dashboard unit tests and the API's dashboard integration tests updated.

  **What shipped (2026-08-23):** State A: `HollandCodeChips` (new shared component, `src/components/riasec/`, with an `ordinals` prop ready for TAM-114) replaces the "ظهرت نتيجتك: SIA" sentence; one action, no summaries/previews/retake (asserted). State B: the status strip — path name + Arabic type, مكتملة / قيد التنفيذ / لم تبدأ — as a labelled list with nothing clickable; `DashboardView.path` gained `riasecLetter` and `inProgressCount` from the server (API integration test asserts them against a real database). State C untouched. 4 new web tests; API journey spec extended.
  **Implementation notes (verified):**
  - All three branches are in `src/app/(portal)/page.tsx`, switched on the server-decided `dashboard.state` — keep rendering one branch per state; never assemble a screen from nullable fields.
  - **State A:** the code arrives as `dashboard.codeString` (e.g. "RIA", `DashboardView` in `packages/types/src/journey.ts`). Split its characters and map each through `riasec.<letter>.name` — all six names already exist in `messages/ar.json`. The current `dashboard.assessedBody` message interpolates `{code}`; rework it and remove what's no longer referenced or the catalog test fails. Chip fill: `--accent` (light gold) with navy text — the AA-safe achievement fill (6.01:1, D-025). Never raw gold behind body-size text; the contrast test enforces it.
  - **State B — API extension:** `DashboardView.path` carries only `{id, name, completedCount, totalCount, nextCourse}`. Add `riasecLetter` and `inProgressCount` (remaining = total − completed − inProgress, client-side) to the server's dashboard view builder in `apps/api` — one request, server decides, same pattern as the state field. Do NOT have the page call the my-path endpoint as a second request. The letter is already in the DB (`paths.riasec_letter`); `MyPathView` proves the counts are derivable server-side from per-course `status` (`UserPathCourseStatus`).
  - The RIASEC Arabic name for the path tile comes from the same `riasec.<letter>.name` messages as the chips — one lookup helper serves both states.
  - `src/test/pages/dashboard.test.tsx` asserts State A's current copy and will need State B's new payload fields in its fixtures — the type error is the reminder. Rebuild `packages/types` (`npm run build:types`) before web/api typechecks pick up the change.

---

> **Epic label: `profile`** — §4.12's profile/settings surface. progress.md deferred all of this to "Phase 5/6"; these tickets pull it forward deliberately (record that in decisions.md with the first PR). Shared rules: extend the existing single-card Tamkeen design (no reference-repo porting); every mutation is audited (§2), rate-limited like the other auth endpoints, and validated on both client and server; employee ID is identity and is **never** user-editable. No new email notification types may be added without amending the locked notifications rule (§2) — flag, don't improvise.

## TAM-109 — Profile: show employee ID + department, edit name + department — **display half DONE** (with the TAM-124 branch: both fields shown read-only; editing still open)

- **Labels:** `profile`, `frontend`, `api`
- **Priority:** High (the other profile tickets build on the same page sections)
- **Pre-requisite:** none
- **Description:**
  Employee ID and department are collected at registration but never shown — the session user carries only id/email/name/role. Expose both on the profile's "بياناتك" card (read-only), and let the employee **edit their own full name and department** in place (single "حفظ" action, inline validation, success/error states). Employee ID and role stay read-only.
  **Name changes must reach Moodle:** the course page renders the learner's name from Moodle's own record (verified in the Phase 2 pass). Propagate name updates through the `LmsPort` (new `updateUser` operation — mock + real + contract test) for users who already have a `moodle_user_id`; users not yet provisioned need nothing. Failure to propagate must not block the save — audit it and let the sync job's reconciliation pattern (D-036) own the retry.
  **Acceptance:**
  - Profile shows الاسم الكامل، البريد الإلكتروني، الرقم الوظيفي، الإدارة، الصلاحية; name and department editable, the rest not.
  - `PATCH /api/me/profile` validates (non-empty name, department), writes an audit entry (actor + which fields changed — not old/new values, that is PII), covered by integration tests.
  - After a name change the Moodle user's display name matches (contract test against the mock; verified once against the real Moodle).
  - Loading / saving / error states; labelled inputs; keyboard-complete; RTL at 360px.
    **Implementation notes (verified):**
  - `AuthenticatedUser` (`apps/api/src/auth/session.service.ts`) and the login response in `auth.service.ts` both select `{id, email, fullName, role}` — add `employeeId` and `department` in both places and in the web session type so `usePortal().user` carries them. The DB columns already exist (`users.employee_id`, `users.department`).
  - There is no users/profile module yet — create a small `me` module rather than growing `auth`. Controller stays thin; rules live in the service (project convention).
  - `LmsPort` is `apps/api/src/moodle/lms.port.ts`, executable contract in `lms.contract.ts`; the mock must implement the new operation with the same semantics so the contract suite remains the swap guarantee. Real adapter: `core_user_update_users` must be added to the Moodle external service's function list on the ministry instance (add it to the Moodle setup checklist).
  - Page: `src/app/(portal)/profile/page.tsx`; copy under `profile.*` in `messages/ar.json`; use the shared `Field`/`Input` components.

## TAM-110 — Profile: change password — **DONE** (`feature/tam-110-change-password`, D-107)

- **Labels:** `profile`, `frontend`, `api`, `security`
- **Priority:** High
- **Pre-requisite:** TAM-109 (page sections + `me` module)
- **What shipped (2026-08-26):** most of this ticket had landed with the profile epic (PR #22): `POST /api/auth/change-password`, `revokeAllForUserExcept`, the profile card, the audit entry. This branch closes the acceptance gaps: **a wrong current password now feeds the same failure counter and lockout as sign-in** (`countFailedAttempt`, shared by both paths; a locked account is refused with `ACCOUNT_LOCKED`; proving the password resets the counter), and **the confirmation is checked on the server** (`confirmPassword` in the DTO, refused as `PASSWORDS_DO_NOT_MATCH` before any attempt is counted). **The card is shared with the entity portal:** `components/profile/password-card.tsx` renders on §4B.6 too (below the read-only organisation record; also for a super-admin visiting without an organisation) — the credential belongs to the account, not the role, and the endpoint asks no more of an entity than of an employee. The email question is recorded as D-107. Tests: profile e2e +3 (lockout parity, server confirm, counter reset) with the existing five updated; page tests +1 (the lockout message). Proven live: mismatch → 400, one guess → 401 and counter 1, correct change → 204 and counter 0, audit `FAILURE:BAD_PASSWORD` then `SUCCESS`.
- **Description:**
  A "تغيير كلمة المرور" section: current password, new password, confirm. Same password policy as registration (`PASSWORD_MIN_LENGTH`; length over composition, NIST 800-63B). On success: **revoke every other session of the user, keep the current one**, write an audit entry, show a success status in place.
  A wrong current password returns the generic credentials error and counts toward the per-account lockout — changing a password must not be a cheaper brute-force surface than login.
  **Open decision to record:** a "your password was changed" email is standard security hygiene but is NOT in the locked notification list (§2). Ship without it; raise the amendment with the product owner and add it in a follow-up if approved.
  **Acceptance:**
  - `POST /api/auth/change-password` requires an authenticated session + current password; enforces the policy; audited; rate-limited with the auth-endpoint limits.
  - Other sessions are dead after the change (integration test: two sessions, change via one, the other gets 401); the current one survives.
  - Five wrong current passwords trip the same lockout as login.
  - New password ≠ current password; confirm must match (client + server).
    **Implementation notes (verified):**
  - `SessionService.revokeAllForUser(userId)` exists but revokes **all** sessions including the current — add a `revokeOthersForUser(userId, keepSessionId)` variant rather than logging the user out of the device they just used.
  - Argon2 verification and the lockout counters live in `auth.service.ts` — reuse the login path's helpers (including the dummy-verify timing equalisation) instead of re-implementing the comparison.
  - Endpoint belongs under `auth` (credential management), not `me`.

## TAM-138 — Entity profile: the employee's editable surface, and a two-column profile on both portals — **DONE** (`feature/tam-110-change-password`, D-108)

- **Labels:** `profile`, `entity`, `frontend`, `api`
- **Priority:** High (at the user's direction, 2026-08-26, alongside TAM-110)
- **What shipped:** §4B.6 now carries what §4.12 carries — an account card (the account holder's name editable; email and role read-only; the organisation's **name** read-only with a line saying the ministry manages it, D-063; the organisation's **contact name and contact email** editable), the digits preference, and the password change — through `PATCH /api/entity/me` (`UpdateEntityProfileDto`; refused with 403 for an account with no organisation rather than half-saved; the organisation name is not accepted in the body; audited as `ENTITY_PROFILE_UPDATED` with the field names, never the values; a name change reaches the LMS best-effort as the employee's does). `DigitsCard` and `PasswordCard` are shared components under `components/profile/`. **No email-change card for the entity:** its address is outside the ministry domain that `change-email` enforces (D-017), so the card could only refuse. **Layout:** both profile pages leave the narrow single column for the standard width with two columns from `lg` — the account card leads the start column with the digits beneath it, the credential cards fill the end column; one column in that order below `lg`.
- **Supersedes** the embed branch's open TAM-135 (entity contact details) once that branch renumbers.
- **Acceptance met:** 5 new integration tests in `entity-scoping.e2e-spec` (one save + audit fields, the organisation name refused in the body, validation incl. empty contact allowed, scope not body picks the row, orphan/admin refused); 8 page tests in `entity-profile.test.tsx`; web 528, API e2e scoping 19/19, typecheck/lint clean; both pages screenshotted at 1440px. Also carries TAM-131's nav fix (`activeNavHref`) from the embed branch, so the entity rail marks one item.

## TAM-111 — Profile: change email with re-verification

- **Labels:** `profile`, `frontend`, `api`, `security`
- **Priority:** Medium
- **Pre-requisite:** TAM-109, TAM-110 (reuses the section layout and the current-password check)
- **Description:**
  A "تغيير البريد الإلكتروني" section: new address + current password. The new address must pass the same restricted-domain policy as registration. A verification link goes to the **new** address; **the old address stays the login until the new one is confirmed** (§4.12). Confirming swaps the email, revokes other sessions, audits the change. Pending requests expire with the existing verification TTL; a newer request supersedes an older one.
  **Moodle coupling (handle it, don't discover it):** the Moodle username is derived from the email (`deriveMoodleUsername`, D-038) and Moodle stores the email too. The username must **not** be re-derived for an already-provisioned user — `moodle_user_id` is the identity link. Update the Moodle record's email through the `LmsPort.updateUser` operation TAM-109 adds; not-yet-provisioned users simply provision later with the new email. Record this in decisions.md as an addendum to D-038.
  Enumeration resistance: requesting a change to an address that already exists must be indistinguishable from success (same pattern as registration/forgot-password).
  **Acceptance:**
  - Request → email to the new address (Mailpit in tests) → confirm → login works with the new address and fails with the old; until confirmation the old address keeps working.
  - Taken address: identical response, no change, audit notes the attempt without recording the address.
  - Domain policy enforced; current password required; audited; rate-limited.
  - Provisioned user: Moodle email updated, Moodle username unchanged (contract test).
    **Implementation notes (verified):**
  - Reuse the `auth_tokens` single-use hashed-token infrastructure and the existing verify-email page/endpoint shape with a new token type (`EMAIL_CHANGE`); store the pending address as `users.pending_email` (it is not a secret, but it must not become the login before confirmation).
  - The verification email is a _reuse_ of the locked "email verification" notification type, not a new type.

## TAM-112 — Sign-out: the header user menu, one exit for every role — **DONE** (`feature/tam-112-sidebar-signout`, revised per D-096)

- **Labels:** `profile`, `frontend`
- **Priority:** Low
- **Pre-requisite:** none (independent; small)
- **Description:**
  Sign-out lives only on the profile page because it needed a home. Add a sidebar footer showing the user's name with a quiet "تسجيل الخروج" action, reachable from every portal page; the profile page keeps its own sign-out as a secondary action at the bottom ("both" per discussion). It is a footer, not a seventh nav item — the six-item steady-state nav is untouched.
  **Acceptance:** footer present on every `chrome="nav"` page, keyboard-reachable, not announced inside the primary-navigation landmark; behaviour identical to the profile button (logout call, then `/login`, navigating even if the request fails); e2e sign-out passes from a non-profile page.
  **What shipped (2026-08-23):** a sidebar footer (user's name + quiet "تسجيل الخروج") on every `AppShell` page — learner and entity frames both pass the user in — outside the navigation landmark; the logout-then-navigate-regardless behaviour extracted to `useSignOut()` and shared with the profile page, which keeps its own button. 3 shell tests (footer placement, sign-out, sign-out when the request fails); e2e signs out from the sidebar on the profile page and checks the session cookie is gone. TAM-117 may later move this into its header bar — the hook makes that a placement change only.
  **Implementation notes (verified):** the shell is `src/components/layout/app-shell.tsx` + `sidebar-nav.tsx`; `PortalPage` hands it `navForState(...)` items — the footer is layout, not a nav item, so it belongs in `AppShell`, fed from `usePortal().user`. The logout call and the "navigate regardless" comment already exist in `profile/page.tsx` — extract a shared hook so the two buttons cannot drift.

---

> **Epic label: `results`** — the Results & Path Selection page (§4.4). Two tickets: TAM-113 restructures the path list (do this first — it reshapes the cards), TAM-114 adds behaviour on top. Approved mockup: the "Tamkeen Results Page" artifact (shared from Claude Code). The result card itself stays exactly as built.

## TAM-113 — Results page: ranked letter groups, compact cards, other paths collapsed

- **Labels:** `results`, `frontend`, `spec-change`
- **Priority:** High
- **Pre-requisite:** none
- **Description:**
  With twelve seeded paths (two per letter) a user faces **six equal-looking gold cards plus six plain ones**, each with a full description, under a tall result card — overwhelming, and the ranking that matters is invisible. Restructure the path list so the user's own ranking organizes the page. Same data, same routes, same API; the **result card is untouched**.
  1. **Group recommended paths by letter rank.** One section per letter in the user's code, in rank order, with a heading: "الأقرب إلى ميلك الأول — الاجتماعي" for #1, "مناسب أيضًا — المبادر" with a quiet "ميلك الثاني" tag for #2, likewise #3. Two cards per group with the current seed. The heading answers "why is this recommended?" — no per-card explanation is needed.
  2. **Compact cards.** Name, RIASEC type, "موصى به" badge, course count, duration, one button "استعرض المسار". **The description leaves the card** and lives on the path page the button opens. Gold border + badge treatment unchanged (D-025 contrast rules).
  3. **Other paths collapsed, not hidden.** "مسارات أخرى" sits behind a native `<details>` toggle labelled "عرض المسارات الأخرى (6)" with the live count; expanded, they render as the same compact cards, fully selectable. This amends §4.4's "shown normally below" → "available one click below"; §3A's _recommendation, not restriction_ is preserved. Record in decisions.md.
     The first screenful becomes: the user's code + the two paths that fit them best.
     **Acceptance:**
  - Gold paths appear under exactly one heading per letter of the user's code, in the user's rank order; a letter with no paths produces no empty heading.
  - Cards show only name/type/badge/count/duration/button — no description text anywhere in the list (asserted).
  - The toggle shows the correct count, is keyboard-operable, announces expanded/collapsed state, and every other path is reachable and clickable once expanded. Collapsed by default on every visit (no persistence).
  - Sort order inside each group is the API's — never re-sorted client-side (asserted).
  - Result card, `noResult` empty state, `canRetake`, no-sidebar (`chrome="bare"`) unchanged.
  - CLAUDE.md §4.4 amended; decisions.md entry added; `path-card.test.tsx` and the results page test updated.
    **Implementation notes (verified):**
  - Page: `src/app/(portal)/results/page.tsx` — today a `filter(recommended)` into one grid plus an "others" grid. Group with `recommendationRank` (0–2, already on every `PathSummary`; null for non-recommended) — no API change. Headings' letter names come from `riasec.<letter>.name`; ordinal words (الأول/الثاني/الثالث) go in the `results` namespace.
  - Card: `src/components/paths/path-card.tsx` — remove the description paragraph; keep the "plain paragraphs, not a definition list" rule recorded in the file (a `<dl>` made screen readers announce labels twice).
  - Use `<details>/<summary>` for the collapse: free keyboard + state semantics, no JS state; give `summary` a visible focus ring (gold, 3:1 passes for non-text) and hide the default marker in favour of a mirrored caret (logical properties only).
  - Heading levels: page `h1` → group headings `h2` → card names `h3`; the collapsed section's summary is not a heading.
  - The seed guarantees two paths per letter, but real data (Phase 7) won't — handle 0..n paths per group.

## TAM-114 — Results page: post-commitment state + shared Holland chips

- **Labels:** `results`, `frontend`
- **Priority:** Medium
- **Pre-requisite:** TAM-113 (works on the compact cards). Coordinate with **TAM-108** (dashboard chips): whichever lands first creates the shared `HollandCodeChips` component; the other consumes it. Do not build two.
- **Description:**
  **1. Post-commitment state.** After a path is confirmed the page still offers "استعرض المسار" on every card, although switching is impossible (§2). Once committed: the chosen path's card carries a **"مسارك" marker** and its one action becomes a link to `/my-path`; every other card **loses its button** and renders as reference only (no disabled buttons — absence, per §3). The result card keeps working as the user's permanent Holland profile (retake already vanishes via `canRetake`).
  **2. One shared `HollandCodeChips` component** for the code, used here and on the dashboard (TAM-108): light-gold fill (`--accent`) with navy text, rank order, an optional `ordinals` prop so Results keeps its "1. الاجتماعي" numbering while the dashboard shows names only. Results keeps the summaries, the bars and the retake beneath the chips — only the chip row is shared. (A radar chart for the six dimensions was considered and rejected: it needs its own text alternative and adds nothing the bars don't say.)
  **Acceptance:**
  - Committed user: exactly one card shows "مسارك" + link to مساري; no other card — in any group or in the collapsed section — has a button; uncommitted user sees TAM-113's behaviour unchanged.
  - The dashboard and Results render the code through the same component (a test imports it from one path; grep finds no second chip implementation).
  - `noResult` empty state, `canRetake`, API sort order, no-sidebar — unchanged, asserted.
    **Implementation notes (verified):**
  - The committed path id is already on the client: `usePortal().dashboard.path?.id` is non-null exactly when `dashboard.state === 'ACTIVE_PATH'`. Pass a `committedPathId` prop into `PathCard` rather than having the card read portal state — keeps it presentational and its tests simple. A user mid-build (path chosen, not yet confirmed) is still `ASSESSED_NO_PATH` and sees all cards as choosable — correct, nothing is locked before confirm.
  - The current chips live inline in the `HollandCode` function in `results/page.tsx` (gold **border** + ordinal); extract to `src/components/riasec/holland-code-chips.tsx` (or wherever TAM-108 placed it) and delete the inline version — the acceptance grep catches a leftover copy.
  - The "مسارك" marker must not be gold: gold means _recommended_ (§3), and a chosen-but-not-recommended path would otherwise look recommended after the fact. Navy/secondary styling.

---

> **Epic label: `dga-alignment`** — adopt the DGA's national design system, **Platforms Code (كود المنصات)**, as the visual foundation of the product. Decided 2026-08-23: **full adoption including the palette**, applied to the **landing page and auth screens first**, the signed-in portal in a follow-up epic. **Source of truth: the official site `design.dga.gov.sa` and the official Figma "Components Library – Platforms Code"** — the community shadcn registry (`dga-registry.vercel.app`, 24 RTL components, unofficial) may be consulted as an accelerator but never as the authority.
> Why: this is a Ministry of Interior platform; the national design system is what the ministry and its users will recognize, and the landing page rebuilt from the reference repo (PR #5) reads as a generic template rather than a government product.
> **Ministry questions (blockers, add to progress.md):** (1) confirm whether Platforms Code compliance is _mandatory_ for this platform or adopted by choice — it changes how much deviation is allowed; (2) who on the team has access to the official Figma library; (3) the ministry's own emblem/seal is still missing (D-051) and the landing/auth designs need it.
> **Consequence the whole team must know:** the palette lives in `apps/web/src/app/globals.css` as semantic tokens every shadcn component reads. Swapping it recolors the **entire app** — portal included — in one change. That is accepted; what is staged per surface is component/pattern alignment, not color.

## TAM-115 — Platforms Code foundations: tokens, typography scale, contrast audit, spec amendments

- **Labels:** `dga-alignment`, `design-system`, `frontend`, `spec-change`
- **Priority:** High (blocks TAM-116 and the re-based auth epic)
- **Pre-requisite:** someone with the official Figma/site extracts the foundations (this could not be fetched from the site, which is a JS app). Deliver them as a short written token sheet attached to this ticket _before_ implementation starts.
- **Description:**
  Replace the Tamkeen brand tokens with Platforms Code foundations:
  1. **Color** — the official palette (primary, secondary, neutrals, semantic success/warning/danger/info, surfaces, borders, focus ring) defined once in `globals.css` `@theme`, with the shadcn semantic layer (`--background`, `--primary`, `--accent`, …) re-mapped onto them. Delete `--color-navy/gold/...` rather than aliasing them, so nothing keeps referencing the old brand.
  2. **Typography** — keep IBM Plex Sans Arabic (Platforms Code's typeface; already self-hosted, D-023); adopt its type scale (sizes/weights/line-heights) as Tailwind theme values.
  3. **Spacing, radius, elevation, motion** tokens as published.
  4. **Contrast audit redone** — `src/lib/contrast.test.ts` currently encodes the gold restriction (D-025). Rewrite it for the new palette: every text/background pairing the semantic layer produces must clear 4.5:1 (3:1 for large text and non-text), asserted, with any restricted pairing documented the way gold was.
  5. **Spec amendments** — CLAUDE.md §3 (the palette table and the gold-means-recommended rule), D-009, D-025 superseded by a new decision; the §3A "gold = recommended" treatment needs a Platforms-Code-native equivalent (e.g. the primary accent + the "موصى به" badge — colour alone was never sufficient, WCAG 1.4.1). Record it.
     **Acceptance:**
  - No hex literal outside `globals.css`; `grep -rn "#[0-9a-fA-F]\{6\}" src --include=*.tsx` returns nothing.
  - Contrast test rewritten and green; the catalog test still green.
  - The full web suite passes with the new tokens (component tests assert structure, not colors — if any asserts a color class, fix the test, not the token).
  - The recommended-path treatment on Results and the certificates' achievement accent have a defined replacement — documented in decisions.md, not left to whoever touches them next.
  - Artifact mockups (dashboard, results) noted as pre-DGA in their headers; structure stands, colors don't.
    **Implementation notes (verified):** brand tokens are at the top of `globals.css` (`@theme { --color-navy … }`) with the semantic mapping in `:root`; the contrast assertions are in `src/lib/contrast.test.ts` (24 assertions incl. negative tests); `packages/types/src/locale.ts` owns the digit/locale switch (untouched); certificate/CV PDF templates (Phase 3, `apps/api`) have their own styling — check whether they consume the same tokens or hardcode brand colors, and ticket the PDFs separately if the latter.

## TAM-116 — Landing page redesign on Platforms Code

- **Labels:** `dga-alignment`, `frontend`, `landing`
- **Priority:** High
- **Pre-requisite:** TAM-115 (tokens), the ministry emblem (D-051) or an explicitly placeholder slot for it
- **Description:**
  Rebuild `app/landing` and `components/landing/*` on Platforms Code **templates and components** instead of the reference repo's layout. The current page (reviewed 2026-08-23, screenshot on file) fails as a government front page: no emblem, no product preview, everything centered and small, the same icon-in-box card grid three times, a gold-fill CTA with white text (fails contrast), and filler stats.
  Required:
  - **Mandatory government elements** per the official guidelines — whatever Platforms Code prescribes for the official-site banner/header, ministry identity block, footer (required links, classification line), and language/accessibility controls. Extract the exact list from the official site into this ticket before building; do not guess.
  - **Hero** — ministry emblem + platform name, one clear statement of what the platform does for an employee, one primary CTA (إنشاء حساب) and the sign-in link, and a **real product preview** (a composed screenshot/illustration of the results or dashboard screen) instead of empty cream.
  - **Content sections rebuilt on Platforms Code patterns** — the four-step journey keeps its sequence (it is genuinely ordered), the "problem" and "trust" sections lose the repeated card grid in favour of whatever list/feature patterns the system provides. Left-aligned RTL text blocks; body copy at the system's minimum readable size and contrast.
  - **Honest stats only** — 12 paths / 48 courses may stay (they are data); "6 ميول" and "4 خطوات" go.
  - Copy: keep the existing `landing.*` Arabic messages where they still fit; anything new is realistic placeholder pending the Training Directorate.
    **Acceptance:** the page passes the Platforms Code checklist the implementer extracted (attached to the PR); emblem slot present; product preview present; no gold-fill/white-text anywhere; AA contrast across all text; keyboard + screen-reader pass; 360px RTL; `landing.test.tsx` updated; the landing e2e (signed-out `/` shows the page, CTAs route to `/register` and `/login`) still green.
    **Implementation notes (verified):** `app/landing/page.tsx` renders `LandingView` unconditionally; `/` renders the same view for signed-out visitors via `PortalProvider` and routes signed-in users by role (learner `/`, entity `/entity`) — keep that wiring. Messages are under `landing.*` in `ar.json` with `{min}`/`{max}` interpolations for the 5–10 rule — keep them interpolated, never hardcode the numbers. The Next.js dev overlay badge ("N" circles) is not part of the page.

---

> **Epic label: `portal-dga`** — the signed-in experience (learner portal and entity portal) on Platforms Code: shell, shared components, every page, then a gate. Replaces the TAM-117 stub. **Why now:** the tokens (TAM-115) recoloured the portal, and the auth pages (TAM-101–105) put the DGA _form anatomy_ into the shared `Input`/`Field`/`Select`/`Alert` — so the portal is already half-aligned by construction. What remains is the shell, the non-form components, and the page-level patterns. Shared rules: logical properties only; one primary action per screen (§3); loading/empty/error states on every data view (§2B); WCAG 2.1 AA gated by axe, not reviewed by eye; the behaviour tickets already written (TAM-107, 108, 109–114) are implemented **on top of** this epic's components, never blocked on it — if one lands first it uses the new tokens, and this epic restyles it.
> **Source of truth:** the official Platforms Code site/Figma; the community registry's Navigation Menu, Breadcrumb, Card, Table, Tabs, Tag, Tooltip, Skeleton and Sonner definitions are the practical reference for component anatomy (unofficial — reconcile with the official spec where they differ).
> **Branching:** `feature/tam-117-portal-shell` off `feature/tam-106-nav-gating`; each following ticket stacks on the previous.

## TAM-117 — Portal shell on Platforms Code: header bar, light sidebar, page frame, footer — **DONE** (`feature/tam-117-portal-shell`, D-097; sign-out had already moved to the header user menu per D-096, which this shell keeps)

- **Labels:** `portal-dga`, `frontend`, `design-system`
- **Priority:** High (every portal page sits in it)
- **Pre-requisite:** TAM-106 (the nav gating lives in the shell's nav list)
- **Description:**
  Rebuild `AppShell` (and the entity portal's `EntityPage` frame, which mirrors it) the way a government application is framed:
  1. **A top header bar** — ministry emblem + Tamkeen logo on the start edge (the same lockup as the landing header and `AuthLayout`), the signed-in user's name and a sign-out action on the end edge (this absorbs TAM-112's "sign-out in the shell"; TAM-112 is closed by this ticket), on a white surface with a hairline bottom border.
  2. **A light sidebar** — white/neutral-50 ground, Platforms Code navigation-menu anatomy: each item an icon + label row, the active item marked with a primary start-edge bar and primary text (`aria-current="page"` as today), hover on neutral-100. **This replaces the dark `neutral-900` rail**, which is a leftover of the navy era: Platforms Code applications use light navigation with the primary as the active indicator, and a dark rail next to white content is the one place the portal still looks like the old brand. Below `md` the sidebar becomes the existing horizontal strip, restyled the same way.
  3. **The page frame** — `PortalPage`'s title row as a DGA page header (title, optional single action on the end edge, optional breadcrumb for nested pages such as a course inside the catalogue), content on the neutral-50 ground with white cards.
  4. **A slim footer strip** — © وزارة الداخلية · classification — on every shell page, matching the auth footer.
     The certificates indicator (the dot on شهاداتي) and the skip link are kept; `navForState` and its gating are untouched.
     **Acceptance:**
  - Learner and entity portals share one shell implementation (the entity frame is a configuration of it, not a copy).
  - Sidebar: light ground, primary active bar, `aria-current="page"` preserved; all nav tests (`nav-items.test.ts`, `sidebar-nav.test.tsx`, `portal-provider.test.tsx`) green unchanged.
  - Header shows the lockup and the user's name; sign-out works from every page (the logout call + "navigate regardless" already in `profile/page.tsx`, extracted to a shared hook — TAM-112's content).
  - No physical-direction classes (grep), no hex literals; the skip link remains the first focusable element (e2e already asserts this).
  - axe clean on the dashboard in all three states (the e2e gate arrives fully in TAM-121, but this ticket runs it on the shell).
    **Implementation notes (verified):** shell is `src/components/layout/app-shell.tsx` (`<aside class="bg-neutral-900 md:w-64">`, brand lockup on a white tile — the tile exists _because_ the rail is dark; it goes when the rail is light); nav rendering is `sidebar-nav.tsx` (active state at its `cn(...)` around line 62, indicator dot line 91); the page frame is `portal-page.tsx` (`PortalPage`, with `chrome="bare"` for flow pages — keep that prop, TAM-107 changes which pages use it); the entity frame is `entity-page.tsx` + `entity-nav-items.ts`. The user's name comes from `usePortal().user` / `EntityProvider`. The landing header (`components/landing/site-header.tsx`) already has the exact lockup markup to reuse.

## TAM-118 — Shared portal components on Platforms Code: Card, Badge/Tag, Progress, Table, Skeleton, states, Textarea, Tabs, toasts — **DONE** (`feature/tam-118-shared-components`, D-109)

- **Labels:** `portal-dga`, `frontend`, `design-system`
- **Priority:** High
- **Pre-requisite:** TAM-117
- **What shipped (2026-08-26):** every primitive the ticket names, each with a semantics test — **Card** on radius 8 (`--radius-card` changed, not the call sites) with `variant="selected"` (the primary edge; the four hand-rolled `border-2 border-primary-600` cards on My Path, Certificates and the verification page now use it) and `edge` for the status start-edge notice (the admin's five hand-rolled ones migrated); **Badge/Tag** on the tag anatomy — `neutral | primary | success | warning | danger | info` (`-50` fill, status text and hairline), the old names kept as aliases, `Tag` exported; **Progress** on the neutral-200 track with the primary fill; **Table** (new: `Table/TableHeader/TableBody/TableRow/TableHead/TableCell`, header row on neutral-50, semibold, hairline rows, hover, a required caption, scrolls in its own frame) — the entity learners list is the first consumer; **Skeleton** on neutral-200 / radius 4; **EmptyState** a quiet hairline block, **ErrorState** on the Alert error tone; **Textarea** on the Input anatomy; **Tabs** (new, extracted from the landing explorer which now uses it: WAI-ARIA tabs, one tab in the tab order, direction-aware arrows from the nearest `dir`, Home/End). **No toasts** — no page needed a confirmation the Alert could not serve, exactly as the ticket allowed. Contrast test extended with the five pairings the tag, table and error-state anatomies introduce; `states.test.tsx` green. Admin tables (users, courses) are left for their own sweep — the admin portal is outside `portal-dga`.
- **Acceptance met:** 34 component tests across `card / badge / progress / table / tabs / textarea`; web 710 green, contrast 178/178 incl. the new pairs; typecheck/lint clean; landing explorer, entity learners and the learner dashboard screenshotted at 1440px.
- **Description:**
  Bring the remaining shared primitives to the Platforms Code anatomy, the way `Input`/`Field`/`Select`/`Alert`/`Button` already are, so the page sweep (TAM-119/120) is mostly composition rather than styling:
  - `Card` — DGA card: white, neutral-300 hairline, radius 8 (the system's card radius, replacing the 16 the landing uses for its hero panels), header/content spacing per the system; a `variant` for the "selected/recommended" treatment (primary edge) so `PathCard` and the path-build course cards stop hand-rolling it.
  - `Badge` → the DGA **Tag** anatomy (status tags: neutral, primary, success, warning, danger — the `-50` fill with the status text colour); `Badge`'s `primary`/`dark`/`soft`/`onColor` variants map onto it.
  - `Progress` — DGA progress bar (track neutral-200, fill primary, 8px, labelled) — used by the dashboard, My Path, path build.
  - **`Table`** (new) — DGA table anatomy (header row on neutral-50, semibold 14px, hairline rows, hover) for the entity learners/courses lists, which are hand-built today.
  - `Skeleton` + `LoadingState`/`EmptyState`/`ErrorState` — the same tokens; `ErrorState` on the `Alert` error tone; `EmptyState` as a quiet centred block with one action.
  - `Textarea` — the `Input` anatomy at multi-line.
  - **`Tabs`** (new, extracted from the landing explorer's tablist) for pages that switch views (the entity course page's sections).
  - **Toasts** — the DGA registry uses Sonner for transient confirmations ("تم الحفظ"); add `sonner` only if a page in TAM-119/120 needs a transient confirmation that the `Alert` can't serve — otherwise don't.
    **Acceptance:** every primitive has a component test for its semantics (not its classes); `states.test.tsx` green; contrast test extended with any new pairing a primitive introduces; no page in the portal imports a one-off card/badge/progress implementation after TAM-119/120.
    **Implementation notes (verified):** `src/components/ui/{card,badge,progress,skeleton,textarea}.tsx` and `src/components/states/*` are the whole inventory — there is no table or tabs primitive yet (`entity/learners` and `entity/courses` lay out rows by hand; the landing `about-section.tsx` owns a bespoke tablist worth extracting). `--radius-card` in `globals.css` is 1rem today; the system's card radius is 8 — change the token, not the call sites.

## TAM-119 — Learner portal page sweep on the new shell and components

- **Labels:** `portal-dga`, `frontend`
- **Priority:** High
- **Pre-requisite:** TAM-117, TAM-118
- **Description:**
  Walk the eleven learner pages and compose each on the new shell/components, removing any bespoke styling the primitives now cover, and applying the DGA page patterns: page header with the single action, cards for units of content, the status Tag for course/path states, the progress bar for progress, `Table` where rows are tabular. Pages: dashboard (three states — TAM-108's chips and status strip land on these components), assessment (with TAM-107's sidebar), results (TAM-113/114's structure), path build, courses catalogue, course detail, course player, My Path, certificates gallery, CV builder, profile (TAM-109–111's sections).
  **Acceptance:** every page renders inside the shell with a DGA page header; every data view keeps explicit loading/empty/error states; context-dependent single actions unchanged (§3); all page tests green; no new hex, no physical classes; every page passes axe (TAM-121 gate run per page as it lands).

## TAM-120 — Entity portal page sweep

- **Labels:** `portal-dga`, `frontend`
- **Priority:** Medium
- **Pre-requisite:** TAM-117, TAM-118
- **Description:**
  The six entity pages (dashboard, my courses, manage course, course content, learners, entity profile) on the shared shell (entity configuration) and the new `Table`, status Tags and page headers. Scoping and behaviour (D-027's entity scoping, D-066/067 guards) untouched; the entity e2e fixtures keep their locators.
  **Acceptance:** as TAM-119, for the entity pages; `entity-*.test.tsx` green.

## TAM-121 — Portal a11y and layout gate (axe at three widths), epic close-out

- **Labels:** `portal-dga`, `qa`, `docs`
- **Priority:** Medium
- **Pre-requisite:** TAM-119, TAM-120
- **Description:**
  The TAM-105 pattern for the portal: an e2e spec that signs in, drives to every learner and entity page in a representative state, runs axe (WCAG 2.1 A/AA) and asserts no horizontal overflow at 360/768/1280; a keyboard walk of the shell (skip link → header actions → sidebar → page action). Screenshot review at the three widths; findings fixed or ticketed. Docs: decisions.md entry for the light sidebar and the portal shell; CLAUDE.md §4 page specs updated where the shell changed them; progress.md.
  **Acceptance:** gate green in CI; no open critical/high findings; docs updated.

  Once the tokens are in and the public surfaces prove the direction, align the signed-in portal's **components and patterns** (sidebar/navigation, cards, forms, tables, empty/loading/error states, the recommended-path treatment, the status strip) to Platforms Code equivalents — colors will already have changed via TAM-115. Break this into per-surface tickets at that point; the currently written tickets (TAM-106–114) remain valid in behaviour and should be implemented against the new tokens, not blocked on this stub.

---

> **Epic label: `app-chrome`** — cross-cutting behaviour every page shares.

## TAM-122 — One navigation loader across the app — **DONE** (`feature/navigation-loader`, off `feature/dga-alignment`)

- **Labels:** `app-chrome`, `frontend`, `design-system`
- **Priority:** Medium
- **Pre-requisite:** none
- **What shipped (2026-08-23):** `NavigationProgress` mounted once in the root layout — a 3px primary top bar that starts on any internal link click (capture phase, so `next/link` and plain anchors alike), on back/forward, and on programmatic `push`/`replace` through the new `useAppRouter()` (all seven call sites rewired; it is now the only router hook pages use); completes on the route change; one polite "جارٍ الانتقال…" status per navigation; reduced-motion collapses the animation. In-page data waits keep `LoadingState`. D-072 recorded; CLAUDE.md §3 notes the rule. 5 component tests (idle → active → complete; external/new-window/hash/modified clicks ignored; programmatic start; a11y shape).

## TAM-123 — A meaningful dashboard: tracker, identity, the decision, what is next, what happened — **DONE** (`feature/tam-123-dashboard-content`)

- **Labels:** `assessment-gating`, `dashboard`, `frontend`, `api`
- **Priority:** High
- **Pre-requisite:** TAM-108
- **What shipped (2026-08-23), per the discussion:** every state — journey tracker (4 stages, state-derived) + personal header (name · department · employee id; the session and `/me` now carry both — TAM-109's first bullet, done here) + the last three events. Assessed state — the top three recommended paths as cards in rank order + "عرض كل المسارات". Active state — next courses with status, latest certificate or the locked slot. API: `DashboardView` gained `recommendedPaths`, `upcomingCourses`, `latestCertificate`, `recentActivity`; the feed is derived from assessment results, path confirmation, passed completions and issued certificates. D-074 recorded (it reverses TAM-108's "no previews"); CLAUDE.md §4.2 rewritten. 9 new web tests, API journey + auth integration assertions against the test database; screenshots reviewed for both pre-assessment and assessed states.
- **Not done, by choice:** quick-link tiles in every state (duplicates the sidebar). Recent activity is limited to three events; a full history page is not a dashboard concern.

## TAM-124 — One page width across the portal: الرئيسية is the reference — **DONE** (`feature/tam-124-page-width`)

- **Labels:** `app-chrome`, `frontend`, `design-system`
- **Priority:** High (TAM-125 builds on it; every open page ticket inherits it)
- **Pre-requisite:** none
- **Description:**
  Every page currently picks its own content width, and they disagree: the assessment says `max-w-2xl`, my-path/courses/path-build `3xl`, results `4xl`, the dashboard `6xl` (widened on request in TAM-123, and confirmed as the reference). On a desktop screen most pages float in a narrow centered strip with dead whitespace either side — the same complaint, page after page. Fix it **once, structurally**:
  1. **`PortalPage` owns the container.** It wraps `children` in the dashboard's container (`mx-auto w-full max-w-6xl`) — in **both** chrome variants, `nav` and `bare` (results and path-build are `bare` and need it most). Pages stop declaring their own.
  2. **A `width="narrow"` opt-in** (`max-w-2xl`) for genuinely narrow flows — the assessment questions, the profile form, the course player. Default is the standard width; narrow is an explicit, visible choice in the page's code.
  3. **Sweep the pages:** remove the per-page `mx-auto max-w-*` wrappers (dashboard, results, paths/[pathId] — including the fixed footer's inner container, which must track the same width — courses, courses/[courseId], my-path; assessment/profile/player switch to the prop). In-page `EmptyState`/error wrappers that used their own `max-w-2xl` follow the same rule.
     **Acceptance:**
  - `grep -rn "max-w-" src/app/(portal)` returns nothing — the only content-width declarations live in `PortalPage` (asserted in a test or CI grep).
  - Dashboard renders exactly as before (it is the reference, not a change target).
  - Path-build's fixed counter bar aligns flush with the page content at every viewport.
  - No horizontal overflow at 360px on any portal page; existing page tests updated, e2e journey green.
    **Implementation notes (verified):**
  - `src/components/layout/portal-page.tsx` — the `bare` branch renders `<main id="main-content" className="p-6">{children}</main>`; the `nav` branch delegates to `AppShell`, whose `<main>` padding is in `app-shell.tsx`. Put the container around `children` in `PortalPage` itself so both branches share it, rather than inside `AppShell`.
  - Current per-page widths to sweep: `assessment` 2xl → narrow prop; `courses/[courseId]` 3xl → default; `courses/[courseId]/player` 2xl → narrow; `my-path` 3xl (+2xl empty states) → default; `page.tsx` (dashboard) 6xl → default; `paths/[pathId]` 3xl + footer inner 3xl → default; `profile` 2xl → narrow; `results` 4xl (+2xl empty state) → default.
  - The fixed footer in `paths/[pathId]` is outside the flow, so it cannot inherit the wrapper — it keeps its own inner container; give both the same width via one exported constant/class rather than two literals.
  - TAM-119/120 (the portal-dga sweeps) restyle these pages later — they build on this standard, not around it.

## TAM-125 — Path build page: header card with meta + selectable-card course grid

- **Labels:** `paths`, `frontend`
- **Priority:** High
- **Pre-requisite:** TAM-124 (the grid needs the standard width)
- **Approved mockup (2026-08-24):** https://claude.ai/code/artifact/58480b76-3385-4980-921e-01468b3d0bad — second screen; the annotations are part of the spec.
- **Description:**
  The build page (screenshot 2026-08-24 on file) is a bare description line and eleven full-width stacked rows, each mostly empty — ~6 screenfuls to see one path's courses, with the choice the page exists for (5–10, confirm) pushed far below. Same data, same API, same rules; the fixed counter bar and the confirm dialog behave exactly as today.
  1. **Header card with meta.** The description plus: the path's RIASEC type as a tag, the «موصى به» badge when the path matches the user's code, the course count ("11 دورة متاحة"), and the **live total of selected hours** (updates as courses are picked — the user sees the commitment grow). This answers "what am I committing to" before the list.
  2. **Selectable-card grid.** Compact cards — title, one-line summary (clamped), hours — in a responsive grid (1 / 2 / 3 columns). **The whole card is the toggle**: one accessible control per course (the card itself is the button, `aria-pressed`), a visible checkbox glyph (decorative, `aria-hidden`) plus the primary-600 selected border — state is never colour alone. Unavailable courses and the at-max state keep their text hints and are not pressable.
  3. **Counter bar unchanged in behaviour** (persistent §4.5, `aria-live`), restyled only as needed to sit on the grid.
     **Acceptance:**
  - Grid at 1/2/3 columns across breakpoints; the eleven seeded courses fit ~2 screenfuls at desktop.
  - Card toggles with pointer **and** keyboard (Enter/Space), announces pressed state; exactly one interactive element per card — no nested buttons/links (asserted).
  - Selected state readable without colour (glyph + `aria-pressed`); unavailable/at-max cards expose their reason as text and are disabled.
  - Header shows type tag, count, and selected-hours total that updates on every toggle; «موصى به» appears only when the path is actually recommended for this user.
  - 5–10 enforcement, confirm enable/disable, the hard-commitment dialog, the locked (`canBuild=false`) state, and API course order — all unchanged, asserted.
  - e2e journey (build step) green with updated selectors.
    **Implementation notes (verified):**
  - Page: `src/app/(portal)/paths/[pathId]/page.tsx` — rows are inline (~lines 147–194); `toggle()` persists each click through `setCourses` and `isPending` already guards double-fires; keep the guard when the whole card becomes the control. `toHours(durationMinutes)` exists.
  - The current row keeps the rule "exactly one control per course, label states the current state" (comment in file) — the card-as-button keeps that rule; the state word (أُضيفت/أضف/الحد الأقصى/غير متاحة) moves into the card as the glyph's label.
  - **Verify the detail payload carries `riasecLetter` and `recommendationRank`** (the list's `PathSummary` has both; the detail endpoint may not) — if missing, add them to the detail response (read-only field, no rule change).
  - The fixed footer's inner width comes from TAM-124's shared constant.

## TAM-126 — My Path as a journey: vertical timeline, one action, the certificate as the last stop

- **Labels:** `paths`, `frontend`
- **Priority:** High
- **Pre-requisite:** TAM-124 (the standard width)
- **Approved mockup (2026-08-24):** https://claude.ai/code/artifact/58480b76-3385-4980-921e-01468b3d0bad — first screen; the annotations are part of the spec.
- **Description:**
  The run view (screenshot 2026-08-24 on file) renders the path as five identical disconnected cards — **every unfinished course carries an «ابدأ الدورة» button** (the next one primary, the rest outline), which is four more actions than §3 and §4.9's "must not compete with continue" allow. Nothing conveys sequence on the one page whose subject _is_ a sequence, statuses are a grey word, and the certificate is a detached box with a lock and no explanation. Same data flow, same routes; restructure the page as the journey it describes:
  1. **Header card with meta.** Path name + its RIASEC type tag (needs `riasecLetter` in the payload — see notes), the progress bar with "X من Y دورات مكتملة" as today.
  2. **Vertical timeline** replacing the card list — one ordered rail, the courses as numbered stops:
     - **Done:** check glyph, «مكتملة» + the quiz grade (already in the payload), and a quiet text link **«عرض الشهادة»** to that course's certificate. No buttons.
     - **Current (`isNextUp`):** the highlighted stop — the card treatment, «التالية» badge, and **the page's only button** («ابدأ الدورة» / «أكمل الدورة»).
     - **Upcoming:** quiet rows, number + title + «لم تبدأ». No buttons. A course that is `IN_PROGRESS` but not next-up shows its status only — its access stays on the course page.
  3. **The certificate is the final stop on the rail,** not a separate box. Locked: lock glyph + how it unlocks («تُفتح عند إتمام دوراتك الخمس» — count interpolated). Unlocked: the achievement treatment + the existing link to the gallery.
  4. **The quiet add (§4.9, owed since Phase 1):** after the last course stop, a subdued text link «إضافة دورة (لديك ٥ من ١٠)» to the catalogue — shown only while the path is active and under `PATH_MAX_COURSES`. The server already enforces everything (add-only, cap of 10); the course detail page already performs the add.
     **Acceptance:**
  - Exactly **one** `<button>`/primary action on the page in every state (asserted): the next-up course's. Done rows expose links only; upcoming rows expose nothing.
  - The list stays an `<ol>` in API order; each stop's state is announced in text (never colour/glyph alone); grades render via `format.percent`.
  - Certificate stop: locked shows the unlock condition with the real remaining count; unlocked keeps today's link; `pathCertificateUnlocked` logic untouched.
  - The add link appears only when `status === 'ACTIVE' && totalCount < 10`, disappears at 10, and never renders for a completed path.
  - `BUILDING` redirect state, `NoPath` empty state, loading/error states — unchanged, asserted.
  - e2e journey green (its my-path step selectors updated).
    **Implementation notes (verified):**
  - Page: `src/app/(portal)/my-path/page.tsx` — `CourseRow` currently gives **every** non-completed course a button (next primary, others outline); that is the bug this ticket fixes, and the comment above it already states the correct rule.
  - Payload: `MyPathView` has `pathId/pathName/status/completedCount/totalCount/pathCertificateUnlocked`, courses have `id/courseId/title/status/gradePercent/isNextUp`. **Missing for this ticket:** `riasecLetter` (header tag) and, per completed course, its `certificateId` (the «عرض الشهادة» link) — add both to the my-path response (read-only fields; the certificates module already knows the mapping; issuance is untouched).
  - The «عرض الشهادة» link points wherever the gallery's view action points for that certificate — one URL scheme, not two.
  - The add link's destination is the catalogue (`/courses`): the course detail page already calls `myPathApi.addCourse` (`api-client.ts:305`) with all server rules enforced (`enrollment.service.ts` `addCourse` — add-only, never remove). No new endpoint.
  - Rail styling: logical properties only (the rail sits on the inline-start side); glyphs `aria-hidden` with the state as text; the timeline is presentation — heading levels stay `h1` page → `h2` courses section → `h3` course titles.

## TAM-127 — Courses catalogue: state-aware default, personal status on cards, DGA filter row

- **Labels:** `courses`, `frontend`
- **Priority:** Medium
- **Pre-requisite:** TAM-124 (the standard width)
- **Description:**
  The catalogue treats every user identically, but the product doesn't: **once a path is confirmed, the server only ever accepts adding courses from that path** (`assertCoursesSelectable` in `addCourse`) — so a committed user browsing 48 global courses is looking at ~40 they can never act on, with nothing marking the ones that are theirs. Meanwhile the filter row is raw pre-DGA HTML and the card is an undifferentiated text stack. Browse stays **global** (§4.6 unchanged — this is a default, not a restriction):
  1. **State-aware default.** A user with a confirmed path lands with **their path preselected** in the path filter — the first screen is "دورات مساري" (their 5–10, statuses visible), and «كل المسارات» is one selection away. Uncommitted users (and users still building) land on the global catalogue, because for them the catalogue's job is evaluating paths.
  2. **The global view is grouped by path, recommended first.** For an uncommitted user, one section per path — the user's recommended paths first in their letter-rank order (heading: path name + «موصى به» + course count), the rest after — courses inside in path order. The catalogue becomes the evaluation tool it's actually used as: "this is what هذا المسار actually teaches." Any search text or filter collapses the grouping into today's flat grid (a filtered result is an answer, not a tour).
  3. **Personal status chip on cards.** When the course is in the user's path, one chip: «مكتملة» / «قيد التنفيذ» / «في مسارك» (not started). At most one chip; courses outside the user's path get none — absence is the signal. Path membership renders as quiet tags instead of today's comma-joined names.
  4. **Filter row on the shared primitives.** Search (`Input`, as today) + path + duration rebuilt on the shared `Select` — the current `<select>`s use dead pre-token classes (`border-input`, `rounded-md`). Same three filters; §4.6's "category" is satisfied by the path filter — record that reading in decisions.md alongside the default (a RIASEC-type filter was considered and rejected: users think in paths, and two filters narrowing the same dimension compete).
     **Out of scope, decided:** no pagination — the grouped default and filters keep screens short at seed scale; paging becomes its own ticket when real ministry data lands (Phase 7). Card click always opens course **detail** (never deep-links to the player) — one predictable behaviour; the chip informs, the detail page acts.
     **Acceptance:**
  - Committed user: first render shows only their path's courses with the path filter visibly set; switching to «كل المسارات» shows everything (asserted). Uncommitted user: grouped global view, recommended path groups first in the user's letter-rank order, no preselection (asserted).
  - Grouping collapses to the flat grid the moment any search/filter is active, and returns when cleared (asserted). Group headings are `h2`, card titles `h3`; a path with no visible courses produces no empty heading.
  - Every card links to `/courses/[id]` — no player deep-links from the catalogue (asserted).
  - Cards for the user's own courses carry exactly one status chip matching their my-path status; other cards carry none; the chip is text, never colour alone.
  - No raw `<select>` remains on the page; filters are labelled, keyboard-operable, and the result count line still announces politely.
  - Search/filter/empty/clear-filters behaviour, debounce, and routes unchanged; loading/error states intact.
  - The stale header comment ("browsable before the assessment" — reversed by D-071) is corrected.
  - decisions.md entry (state-aware default + category-filter reading); page tests updated; e2e catalogue flows green.
    **Implementation notes (verified):**
  - Page: `src/app/(portal)/courses/page.tsx`. The committed path id is already client-side: `usePortal().dashboard` — `state === 'ACTIVE_PATH'` with `path.id` — use it as the filter's initial value (initial state only, not a controlled override; the user's later choice wins).
  - **No API change needed for the chips:** `myPathApi.get()` already returns every selected course with `courseId` + `status` — fetch it once alongside the list (only when committed) and map `courseId → status` client-side. If the team prefers one payload, adding per-user status to the courses list response is the alternative; don't do both.
  - The status chip vocabulary matches my-path's (`statusCompleted` / `statusInProgress` — reuse the `myPath` message keys or lift them to a shared namespace rather than duplicating strings).
  - Card grid is already 1/2/3 columns; keep it, it inherits TAM-124's width. Path tags: same quiet `tag` treatment as TAM-125's header (neutral fill), never the «موصى به» badge on cards — recommendation is a path-level concept; it appears on **group headings** only.
  - Grouping needs no API change either: `pathsApi.list()` already returns every path with `recommendationRank` (null when not recommended), and each course's `paths` names its memberships — group client-side, ordering groups by rank then the API's path order. A course in two paths appears in each group it belongs to (the card is the same; the grouping is a lens, not a partition).

## TAM-128 — Course detail: header with meta, structured sections, the action where it can be seen

- **Labels:** `courses`, `frontend`
- **Priority:** Medium
- **Pre-requisite:** TAM-124 (standard width); pairs with TAM-127 (shared status-chip and path-tag treatment)
- **Description:**
  The detail page (§4.7) is one undifferentiated card: summary, duration, objectives, prerequisites, a comma-joined path list, the certificate line, and — at the very bottom, below everything — the page's single action. The content is right; the shape buries it.
  1. **Header block with meta.** Under the page title: the summary, then the meta row — duration, path membership as quiet tags (TAM-127's treatment), and the user's personal status chip when the course is in their path («مكتملة» / «قيد التنفيذ» / «في مسارك»).
  2. **The single context action moves to the page header** (`PortalPage`'s `action` slot) so it is visible without scrolling — still exactly one action, server-chosen (§4.7: أضف إلى مساري / ابدأ الدورة / أكمل الدورة / مكتمل), never a menu. Verify the «مكتمل» state links to the course certificate as §4.7 specifies — if the payload lacks the certificate reference, add it (read-only; same field TAM-126 adds to my-path).
  3. **Content as sections:** الأهداف and المتطلبات as they are today (omitted when empty — keep that rule), the certificate line as a quiet footnote. No new content; §3's "no redundant UI" holds.
     **Acceptance:**
  - Exactly one action on the page, in the header slot, matching the server-decided state; each of the four states renders its correct label and behaviour (asserted per state).
  - «مكتمل» offers the certificate link; a course not in the user's path shows «أضف إلى مساري» only when the server would accept it (own path + under 10 + not committed-elsewhere rules — the server stays the authority, the button just reflects `course.action` as today).
  - Meta row: tags not comma lists; status chip logic shared with TAM-127 (one implementation).
  - Empty-section omission, error display for a failed add, the reload-after-add behaviour, and the back link — unchanged, asserted.
    **Implementation notes (verified):**
  - Page: `src/app/(portal)/courses/[courseId]/page.tsx` — the comment at the top of the card explains why the course name is not repeated (the `h1` is the page header); keep that. `CourseAction` already renders "the one action the server chose — never a menu"; this ticket relocates it, it does not reinvent it.
  - The add flow's reload-confirms-outcome comment (`addCourse` resolves undefined on success and failure) is a real subtlety — preserve the behaviour and the comment.
  - `PortalPage` already has the `action` prop ("the single primary action for this page, §3") — this is its intended use.

---

> **Epic label: `admin-polish`** — a pass over the super-admin portal at the ministry's direction (2026-08-25), one ticket per page, worked in that order on `feature/tam-130-admin-polish`. Everything below is **DONE** and shipped in **PR #24** (five commits, merged 2026-08-26); the acceptance notes record what was actually asserted. Decisions: D-098 (two removals for a path), D-099 (the dashboard's distribution), D-100 (the dialog).

## TAM-130 — Admin home: a distribution that means something, and nothing on it that cannot be acted on — **DONE**

- **Labels:** `admin-polish`, `frontend`, `backend`
- **Priority:** High (first of the epic)
- **What shipped:** the Holland-code list became a **career-type distribution** — six rows by dominant RIASEC letter with the Arabic type name, the employee count and share, and the number of paths offered for that letter beside it, with «لا مسار معروض» in words when there are none (D-099). `AdminDashboardView.codeDistribution` → `letterDistribution`; §4C.8's reports keep the code breakdown. The **unverified-accounts tile is gone** (§4C.2 badges each such account beside the button that fixes it), the **recent-activity list scrolls in its own focusable, labelled region** (WCAG 2.1.1) so integration health stays near the fold, and the **unpublished-draft flag** the server had always sent is rendered as a link into §4C.3 — it had never been displayed.
- **Also:** the admin portal's retired-token sweep — `bg-gold`, `border-s-gold`, `border-gold` survived D-069, so the distribution bars had no fill and three notice edges no colour. Mapped to primary / info / warning.
- **Acceptance met:** 6 new service unit tests (dominant letter only, all six letters always, size ordering with the canonical tie-break, offered paths only); 6 new page tests (Arabic names not codes, the "no path" wording, the empty state, the removed tile, the scroll region's `tabindex`, the draft link and its absence). Verified in a real browser against the built apps.

## TAM-131 — Accounts: the organisations are a filter away, not a tab away — **DONE**

- **Labels:** `admin-polish`, `frontend`
- **Priority:** High
- **What shipped:** the «الحسابات» / «الجهات» tab bar is removed. The organisations panel — with `إضافة جهة` inside it — appears when the role filter is set to «جهة», above the accounts it explains, so supplier onboarding still reads organisation-then-accounts without a mode to discover. The create-account hint now points at the filter rather than the removed tab.
- **Acceptance met:** page tests assert no tab controls exist, and that the panel and its create button appear only under the entity filter; the e2e was updated at three points where it had leaned on the tab (the tab click itself, an ambiguous «الدور» label now that the filters stay mounted, and the filter reset the tab used to do by remounting). Phase-5 users e2e green.

## TAM-132 — Assessment: remove the back control that undid itself — **DONE**

- **Labels:** `admin-polish`, `frontend`
- **Priority:** Medium
- **What shipped:** «رجوع» is gone from the draft editor. It could not work: entering the editor creates the draft, and the page renders the editor whenever a draft exists, so the button returned to the overview for as long as the refetch took and landed back where it started. The two real exits are unchanged and both sit in the editor's header — publish the version, or discard the draft.
- **Acceptance met:** a page test asserts the control's absence and both exits' presence; `backToOverview` dropped from the catalogue with its last caller. **Known limitation, unchanged by this ticket:** while a draft exists the overview (active version + history) is unreachable — noted in progress.md as owed.

## TAM-133 — Paths: centre the modal, simplify the form, and give a path two removals — **DONE**

- **Labels:** `admin-polish`, `frontend`, `backend`
- **Priority:** High
- **What shipped:**
  1. **Centring (also fixes TAM-131's modal, and every other admin dialog).** `AdminDialog` gained `m-auto` — without it Tailwind's preflight leaves a modal `<dialog>` pinned to the top _right_ of an RTL page, which is what was reported. Same commit: a live backdrop token (the old one referenced retired `navy` and rendered transparent), a height cap with the body as the only scroll region, a per-instance title id, and the removal of the `<form method="dialog">` wrapper that had been closing panels behind their own save/retire/activate requests (D-100).
  2. **Form simplified** — the estimated-duration field and the add-course button are gone (D-098). Course order and removal stay.
  3. **Hide vs delete** — `DELETE /api/admin/paths/:id`, refused for any path someone ever chose or that a certificate names, reported in advance as `canDelete`, audited both ways, with the P2003 race returned as the same refusal. Two sections, two words, a confirmation that names the path and offers the reversible alternative.
- **Acceptance met:** 5 new integration tests against real PostgreSQL (the refusal + its audit, a successful delete with cascading membership and the course untouched, the named audit entry, 404 when already gone); 5 new page tests; 7 tests on `AdminDialog` including the centring class and the absent form; a browser test that deletes the path the suite creates. RBAC coverage is automatic — the suite reflects routes off the controller.
- **Owed, recorded in progress.md:** the learner path card still shows `typicalDurationMinutes`, which now has no editor — deriving it from the path's courses is the fix, and it belongs with the learner-facing screens.

---

> **Epic label: `admin-courses-settings-certs`** — a second pass over the super-admin portal at the ministry's direction (2026-08-26), on `feature/tam-134-admin-courses-settings-certs`. Four tickets, one per area. Everything below is **DONE**. Decisions: D-101 (course states, availability period, delete), D-102 (the pass threshold leaves §4C.6), D-103 (setting editors from the schema), D-104 (the certificate emblem), D-105 (the audit trail).

## TAM-134 — Courses: two states, an availability period that hides by itself, and a real delete — **DONE**

- **Labels:** `admin-courses-settings-certs`, `frontend`, `backend`
- **Priority:** High
- **What shipped:** the oversight screen's four status words collapsed to **«متاحة» / «مخفية»**, with the _reason_ a course is hidden printed under the badge; the filter resolves through the same mapping, so it cannot return a row the badge contradicts. `courses.available_from` / `available_until` are set as calendar days in ministry time and stored as the first and last instant of those days; the window feeds `effectiveCourseStatus` and an ended period yields `HIDDEN_BUT_COMPLETABLE`, never `RETIRED` — a learner mid-course keeps it (§2, D-015). A new sync-cycle stage restates anything whose period opened or closed, and saving the dates recomputes immediately. `DELETE /api/admin/courses/:id` removes the course from Moodle and then from the catalogue, refused for anything a learner holds, a certificate names or a completion records, reported in advance as `canDelete` and audited both ways; `LmsPort` gained `deleteCourse` because our row is a mirror and deleting only our side would have the next sync re-enter the course as an unowned draft.
- **Modal positioning** was already fixed by TAM-133's `AdminDialog` change (D-100) — the manage panel now opens centred, and that was verified in a browser rather than re-fixed.
- **Acceptance met:** 12 unit tests on the derivation and the day helpers, 7 on the refresh service, 4 on the real adapter's warning handling, 3 in the shared LMS contract, 11 integration tests against real PostgreSQL, 16 page tests. Verified in a browser: a period set in the past flipped the course to «مخفية · خارج فترة الإتاحة» on save.

## TAM-135 — Settings: a dropdown, a digits-only field, readable names, no pass threshold, and Settings last — **DONE**

- **Labels:** `admin-courses-settings-certs`, `frontend`, `backend`
- **Priority:** High
- **What shipped:**
  1. **Each field's shape comes from the server**, derived from the Zod field that validates the value (D-103). `REGISTRATION_MODE` and `NUMBER_FORMAT` are enums, so they render as dropdowns whose options are exactly what a save would accept — with Arabic labels, replacing free-text boxes the ministry had to type `restricted` / `admin-only` into from memory. `COMPLETION_SYNC_INTERVAL_MINUTES` is numeric, so its field takes digits and nothing else (stripped per keystroke: `type="number"` accepts `e`, `+` and `-` and then reports the field empty).
  2. **The three certificate keys have Arabic names.** They had been reaching the ministry as the raw `admin.setting.CERT_SIGNATORY_NAME`; `SETTING_KEYS` moved into `packages/types` so the catalogue is asserted against it and the next such key fails CI instead of shipping.
  3. **The pass threshold is gone from §4C.6** (D-102) — no field, no endpoint, and a migration deletes any stored override so the deployment's value is the only answer. Completion sync and the course player read it from the validated environment.
  4. **Settings is the last item in the admin sidebar.**
- **Acceptance met:** 14 page tests (dropdown options and their labels, the value saved is the option not the label, digits-only per keystroke, the three readable names, no `admin.setting` anywhere in the DOM, the absent pass threshold); a catalogue test asserting every `SETTING_KEY` has a label and a hint, and that no label names a key that is not one; the settings integration suite reworked onto keys that still exist, plus a new case proving `PASS_THRESHOLD` is absent from the view and 404s in both directions; the Playwright settings flow moved onto the sync interval.

## TAM-136 — Certificates: the ministry emblem, and no rule above the signatory — **DONE**

- **Labels:** `admin-courses-settings-certs`, `backend`
- **Priority:** High
- **What shipped:** the ministry's own `MOI.svg` is committed under `apps/api/src/certificates/assets/` and inlined into the certificate face in the slot the placeholder mark held — vector, no network, on both the course and the path certificate (D-104). The loader strips the XML prolog and dissolves the exported `.st0` class into per-path `fill` attributes, because an inline `<svg>` shares the document's stylesheet. The rule above the signatory's name is removed; the block keeps its position and spacing. §4C.7's "no logo supplied" notice is driven by `hasMinistryEmblem()` now, so it disappears with the blocker it named.
- **Acceptance met:** 6 tests on the loader (single element, viewBox kept, stylesheet dissolved, no prolog, cached, reports the artwork), 5 on the face (inline not linked, no `.st0`, no prolog, both certificate types, no placeholder left beside it) and 1 asserting the signature block survives without its border; the templates e2e now asserts the notice is gone and the emblem is really in the preview.
- **Still owed:** the ministry **seal** and the signatory's actual signature (D-051). This closes half that blocker.

## TAM-137 — Records and reports: one action vocabulary, and a trail an administrator can read — **DONE**

- **Labels:** `admin-courses-settings-certs`, `frontend`, `backend`
- **Priority:** High
- **What shipped:**
  1. **One target vocabulary.** `AUDIT_TARGET_TYPES` (nine kinds, snake_case) lives in `packages/types` and `AuditEntry.targetType` is typed against it, so a wrong spelling is a compile error. Thirteen call sites wrote `User`/`Entity` beside the snake_case everything else used — one concept in two buckets, which made a filter over that column return a fraction of the rows. A migration normalises the 850-odd rows already written.
  2. **Every entry names what it was about.** `AdminAuditRow.targetLabel` is resolved server-side per page — one query per kind, six for the page — so a retirement reads «مسار: البحوث وتقييم السياسات» instead of showing nothing. A setting resolves on the screen instead, since its id _is_ its key and §4C.6's Arabic name for it is already in the catalogue. A target that has since been deleted resolves to nothing and keeps its id, because those are the entries an investigation wants.
  3. **No technical exposure.** `reason` became its own field and renders as an Arabic sentence; the remaining detail is stripped of every opaque identifier server-side (named ids, anything uuid-shaped, the LMS ids, and any value that merely restates the target) and then rendered through an Arabic label map. An `AUTHZ_DENIED` entry keeps its route — that is the entry's whole point — and both it and the setting value render `dir="auto"`, which fixed a real misreading: `/api/admin/settings` was displaying as `api/admin/settings/`.
  4. **Nothing renders as a raw code.** Three action codes and **all thirty-seven reason codes** had no Arabic copy, so the deliberate fallback was the normal rendering of every failed entry. `AuditAction`/`AuditReason` moved to `packages/types`, all copy written, and the catalogue is now asserted against the constants in both directions.
  5. **The filter row is on the shared `Select`** (it carried dead pre-token classes), the action list sorts by its Arabic label, and a failed outcome wears a new `danger` badge rather than the neutral `dark` one.
- **Acceptance met:** 8 unit tests on the detail presenter; 3 new integration tests (the resolved label, no id anywhere in a page's details, one spelling per kind) against real PostgreSQL; 6 new page tests (the named target, the danger badge, Arabic labelled detail, the setting's own name, the shared `Select`, `dir="auto"` on a route); an exhaustive catalogue test — every action, every reason, every target type — that fails CI on the next untranslated code. **Full suites run for real this session:** 657 API unit · 663 web component · 557 API integration against real PostgreSQL · 114 browser tests in Chromium against the built apps, 113 passing (the one failure is a pre-existing path-build flake that passes on re-run).
- **Also fixed, found by running the browser suite:** TAM-134 removed the «قرار النشر» column from §4C.5 but left the e2e asserting it. The previous session had no Docker and could not have caught it; the assertion now guards what TAM-134 actually built — two words in «الحالة», the reason beneath, and the availability column.
- **Known, not caused here:** the API integration suite passes in full serially (`--runInBand`) and collides when Jest runs its fifteen suites in parallel against one database. Pre-existing test isolation, and very likely the "transient failure never reproduced" recorded on 2026-08-24.
