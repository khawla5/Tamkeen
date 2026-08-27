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

## TAM-113 — Results page: ranked letter groups, compact cards, other paths collapsed — **DONE** (`feature/tam-113-results-groups`, D-113)

**What shipped (2026-08-26):** one `<section>` per letter of the user's code, in rank order — «الأقرب إلى ميلك الأول — {type}» for #1, «مناسب أيضًا — {type}» plus a quiet «ميلك الثاني» / «ميلك الثالث» `neutral` tag for #2 and #3; a letter with no paths produces no heading (asserted). `PathCard` is compact — the description paragraph is gone (asserted absent from the whole list), everything else unchanged. The non-matching paths sit behind one native `<details>`/`<summary>`, «عرض المسارات الأخرى (6)» with the live count, collapsed on every visit, default marker hidden for a caret mirrored with `rtl:-scale-x-100`, its own `focus-visible` ring. Grouping is `recommendationRank` off the existing `PathSummary` — **no API change**, and the anti-re-sort test is kept. CLAUDE.md §4.4 rewritten, §3A amended ("shown normally below" → "available one click below"). jsdom does not implement summary activation, so the component test asserts the toggle _is_ the native element and `journey-happy-path` asserts 6 links collapsed → 12 after Enter, in Chromium.

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

## TAM-114 — Results page: post-commitment state + shared Holland chips — **DONE** (`feature/tam-113-results-groups`, D-114)

**What shipped (2026-08-26):** `PathCard` takes a `committedPathId` prop (read once on the page from `usePortal().dashboard.path?.id`, non-null exactly in `ACTIVE_PATH`), so the card stays presentational. Committed: the chosen card carries «مسارك» in the **neutral** tag — not the primary accent, which means _recommended_ — and its one action links to `/my-path`; every other card in every group and behind the toggle has **no button at all**, not a disabled one. Uncommitted, and mid-build, nothing changes. **Part 2 was already closed by TAM-108**, which created `src/components/riasec/holland-code-chips.tsx` with the `ordinals` prop; Results consumes it and a test now asserts the dashboard and Results render through the same component, so a second copy fails rather than drifts. `noResult`, `canRetake`, the API's order and `chrome="bare"` asserted unchanged.

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

## TAM-119 — Learner portal page sweep on the new shell and components — **DONE** (`feature/tam-119-learner-sweep`, stacked on TAM-118)

- **Labels:** `portal-dga`, `frontend`
- **Priority:** High
- **Pre-requisite:** TAM-117, TAM-118
- **What shipped (2026-08-26):** every learner page composes the TAM-118 primitives and nothing hand-rolls what they cover. **Dashboard:** the recommended-path tiles, the status strip, the latest-certificate panel, the four tiles and the activity list all sit on `cardVariants` (the tiles on `selected`). **Assessment:** option rows on `cardVariants` with the chosen one `selected`; the retired `accent-navy` radio accent is gone (`accent-primary-600`). **Results:** the Holland code is the shared `HollandCodeChips` (itself now the primary `Tag`), and the six ranking bars are on `neutral-200` / `primary-600` instead of the retired `bg-secondary` / `bg-muted`. **PathCard:** `selected` variant plus the primary `Tag` for «موصى به». **Path build:** the selectable course rows on `cardVariants`. **Catalogue:** course cards on `cardVariants`. **Course detail:** paths and status as `neutral` tags, «مكتمل» as the `success` tag. **Player:** the pass / fail outcome as `Card edge="success|danger"`. **My Path:** rows on `cardVariants` (next-up `selected`), «التالي» the primary tag, and **the course state as a status tag** (`success | info | neutral`) beside the grade. **CV:** the language notice as the info `Alert`, skills as `neutral` tags, the preview sheet on the card token. Certificates, course detail's frame, the profile and the player's header were already on the primitives. Every page still renders inside `PortalPage` with its single action and keeps `DataView`'s three states — untouched by this sweep.
- **Acceptance met:** re-audit of `app/(portal)` + the learner components finds no hex, no physical class, no retired token, no `bg-accent` chip and no hand-rolled card; all 13 page test files green (one chips assertion updated from `bg-accent` to the primary tag); typecheck/lint clean; **axe:** `portal-a11y` (the dashboard in all three states) and `profile-a11y` pass against the running app — the latter's fifth and sixth sign-in in one file trip the dev throttle (`/login` 5/min) and are green run singly; CI runs with `RATE_LIMIT_ENABLED=false`. Results, path build, catalogue and dashboard screenshotted at 1440px.
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

> **Epic label: `moodle-embed`** — the entity publishes courses and adds their content **without leaving the portal**. Publishing already lives in the entity portal (Manage Course: metadata, publish/unpublish with blockers — D-059/D-061); adding content is the one step that still hands the entity out to Moodle. Decision (2026-08-25, option A of three): **Moodle's own editor renders inside an iframe within our shell** — Moodle stays the engine and the authoring tool (D-046 Model 1 stands), only its frame around the editor disappears. Rejected: an in-portal authoring UI (Model 2 — Moodle exposes no web-service API to create activities or quiz questions, so it means a large custom plugin _and_ a second authoring surface; D-046 already refused it) and a hybrid "simple things in our forms, the rest in Moodle" (same API gap for whatever we cover, two surfaces drifting). Shared ground rules:
>
> - **Same mechanism as today for identity:** the frame's first URL is the single-use, HMAC-signed `local_tamkeensso` login (D-044) that `author-launch` already mints for the `editingteacher` handoff (D-060) — nothing new is minted, nothing bypasses entity scoping. The plugin gains an `embed` mode; it does not gain any new trust.
> - **Deployment assumption (confirmed 2026-08-25): Moodle lives on a subdomain of the app's site** (e.g. `lms.<site>` under `<site>`). Cookies are then first-party inside the frame and `SameSite=Lax` keeps working. **If Moodle ends up on a different registrable domain this epic does not work as written** — browsers drop third-party cookies by default — and it must be re-planned (Partitioned cookies / Storage Access API, or back to the handoff). Confirm the hostname with the ministry before TAM-129 starts; locally `localhost:3000` / `localhost:8080` are one site (ports do not partition cookies) so development is unaffected.
> - **Moodle's chrome is hidden when framed** (decided 2026-08-25): our shell is the only outer navigation. The secondary _course_ navigation and the course index stay — the editor is unusable without them (see TAM-129).
> - **The full-page handoff stays as a fallback**: «فتح في موودل». It is the recovery when the frame cannot establish a session, and the accessible route for anyone who needs the editor at full size.
> - D-044's open blocker applies with more weight: the chrome hiding and the frame-ancestors header live in `local_tamkeensso`. If the ministry refuses custom PHP and the handoff moves to OAuth2, the same two things must move into a Moodle **theme** — record that in the D-044 follow-up, do not let it surprise hardening.
> - Definition of Done per CLAUDE.md §2B; Platforms Code (D-069); logical properties; WCAG 2.1 AA — the iframe carries a `title`, the fallback is keyboard-reachable, nothing in our page traps focus in the frame.
> - **Not in this epic:** framing the _learner's_ course on `/courses/[id]/player` (D-045's handoff stands for learners). TAM-129's foundation makes it a small later ticket if wanted.

## TAM-129 — Embed foundation: `local_tamkeensso` author-embed mode, frame-ancestors, and the launch flag — **DONE** (`feature/tam-129-embed-foundation`, D-101)

- **What shipped (2026-08-25):** everything in the five points below, proven against the local Moodle 4.5.4: `curl -I` shows `Content-Security-Policy: frame-ancestors 'self' http://localhost:3000` and no `X-Frame-Options`; a Playwright probe framing a fresh `embed=author` URL from `localhost:3000` lands on `course/view.php` with `body.editing`, navbar/footer/breadcrumb hidden, secondary nav + course index visible, and receives `tamkeen:ready`; adding a URL resource inside the frame delivers `tamkeen:content-changed`; the same probe from `127.0.0.1:3000` gets a blank frame and no message. Contract suite + entity e2e (43, incl. two new) green; the plugin is at 0.2.0. Also fixed on the way: the setup script's re-run crash (`role_allow_assign` duplicate), `docker cp` nesting, and CLI-as-root cache permissions (`-u daemon`). Moodle's first-visit **user tour** still pops up inside the frame — Moodle's own onboarding, once per user; hide it in TAM-139 if it reads as noise (`usetours` or the plugin's CSS).

- **Labels:** `moodle-embed`, `moodle-plugin`, `backend`
- **Priority:** High (TAM-139 cannot start without it)
- **Pre-requisite:** Moodle hostname confirmed as a subdomain of the app's site (epic note).
- **Description:**
  Everything on the Moodle and API side that lets a portal page frame Moodle's editor safely. No UI in this ticket; it is proven with `curl`, a throwaway HTML page that frames the login URL, and the contract suite.

  **1. Plugin — `embed=author` mode.** `login.php` accepts `embed=author`. After `complete_user_login` it sets `$USER->editing = 1` (editing on from the first page — a per-session flag, no `sesskey` round trip) and `$SESSION->tamkeen_embed = 'author'`, then redirects to `course/view.php?id=…` as now. Token claims (`moodle-handoff.ts`) are unchanged — the flag is a URL parameter, not part of the signed payload; being framed grants nothing, so it needs no signature.

  **2. Plugin — chrome hiding while the session flag is set.** A body class plus CSS injected from the head hook (`core\hook\output\before_standard_head_html_generation`, 4.4+ hook API — not a theme edit, so it survives upgrades) hides: the top navbar (site logo, primary nav, user menu), the footer, breadcrumbs, and any navigation entry that leads _out_ of the course (site home, dashboard, "my courses"). **Keeps:** the secondary course navigation (Course / Settings / Participants / Grades / More — the quiz editor `mod/quiz/edit.php`, question bank and activity settings are reached through it) and the course-index drawer. Verify on the course page, an activity settings form, the quiz editor and the question bank — those four cover the authoring loop.

  **3. Plugin — framing allowed only from the app.** `allowframembedding=1` in the setup script (`infra/moodle/moodle-setup.php`, beside the other `set_config` lines — Moodle otherwise sends `X-Frame-Options: sameorigin` from `lib/setuplib.php`) **and** a `Content-Security-Policy: frame-ancestors <APP_URL>` header from the plugin's `before_http_headers` hook, from a new plugin setting `allowedframeancestor` that `setup.mjs` stores from `APP_URL`. `allowframembedding` alone lets any site frame a Moodle login page — a clickjacking hole, not a config toggle. Check the container's Apache does not add a second `X-Frame-Options`.

  **4. Plugin — two messages to the parent**, `postMessage` with the allowed ancestor as target origin (never `*`): `{type:'tamkeen:ready'}` once a framed page renders with a session; `{type:'tamkeen:content-changed'}` on the next render after a course-module change (observers for `\core\event\course_module_created` / `updated` / `deleted` and `course_section_updated` in `db/events.php` set a session flag the head hook consumes). Nothing else crosses the boundary — no grades, no learner data.

  **5. API — the launch flag.** `POST /entity/courses/:id/author-launch` (`entity.controller.ts:198` → `management.authorLaunch` → `LmsPort.courseLaunchUrl`) takes `{ embed: true }` and returns `{ url, mode: 'embed' | 'handoff' }`; the real adapter appends `&embed=author` to the `/local/tamkeensso/login.php?token=…` URL it builds (`moodle-http.service.ts:713`). Without the flag, exactly today's handoff URL. Scoping (`scope.resolve`), audit, single-use, `MOODLE_SSO_TTL_SECONDS=60` all unchanged.

  **Acceptance:**
  - `curl -I` on any Moodle page: `Content-Security-Policy: frame-ancestors <APP_URL>` present, `X-Frame-Options` absent. A page served from another origin cannot frame Moodle (browser check); a page from `APP_URL` can.
  - A framed `embed=author` login lands on the course with editing on; navbar/footer/breadcrumb/out-of-course entries absent; secondary nav + course index present; the four authoring pages usable in-frame.
  - `tamkeen:ready` arrives on load; `tamkeen:content-changed` arrives after adding an activity; neither is sent to a parent at another origin (plugin test with a wrong `allowedframeancestor`).
  - `describeLmsContract`: `courseLaunchUrl` with the embed option still varies per call, still carries no WS token; the mock implements it. Entity endpoint tests: with and without `embed`, wrong-entity course → same refusal as today.
  - Docs: a decision entry (why frame now, the same-site cookie premise, chrome hiding via plugin not theme, why `allowframembedding` needs the CSP header); D-044 follow-up noted; progress.md.

  **Implementation notes (verified):**
  - Plugin files: `moodle-plugin/local_tamkeensso/login.php` (redirect target at line 102), `settings.php`; add `db/hooks.php`, `db/events.php`, `classes/hook_callbacks.php`, `classes/observer.php`. Copied into the container by `infra/moodle/setup.mjs:37` — no new deploy step; the setup script must also bump `version.php` so Moodle installs the new `db/` files.
  - Local instance has `allowframembedding=0` today (checked 2026-08-25).
  - Types: `EntityAuthorLaunchView` (`packages/types/src/entity.ts:181`) gains `mode`; `LmsPort.courseLaunchUrl` (`lms.port.ts:145`) gains an options argument.
  - Production needs **HTTPS on both hosts**, or Chrome refuses the framed session cookie.
  - Rejected: putting `embed` inside the signed token (no security value, one more claim); a Moodle theme for chrome hiding (a second custom artefact to approve; the plugin is already hook-capable); a `before_footer` inline script instead of the head hook (renders after the page, delays `ready`).

## TAM-139 — Entity Course Content page: Moodle's editor inside the page, read-back beside it, publish from the same place — **DONE** (`feature/tam-139-entity-content-embed`, stacked on TAM-129; D-115)

- **What shipped (2026-08-25):** `MoodleEmbed` (launch on mount with `embed: true`, loading until `tamkeen:ready`, origin-checked messages, 8 s ready timeout → `ErrorState` + «افتح في منصة التعلّم» on a fresh token, the same link quietly under the frame), the shared `PublishAction` (extracted from Manage Course's card; blockers rendered by the page), the Content page (publish gate in the header slot, read-back strip with the D-061 warning and blockers, one `getCourse` query refetched on `content-changed`), Manage Course's author card as a link («افتح محرّر المحتوى»). Plugin CSS hides Moodle's user tour in the frame. 9 new component tests (credential absent-then-only-src, spoofed origin ignored, read-back + gate refresh on change, fallback on a fresh token, page action = publish gate) + Manage test updated; phase-4 browser suite updated for the moved link and the framed page. Proven live: the entity signs in, the page frames course 81 with editing on, no navbar, no tour, `ready` received, publish disabled with its reasons. Open: provisioned Moodle users render Moodle in English (D-115 note).

- **Labels:** `moodle-embed`, `entity`, `frontend`
- **Priority:** High
- **Pre-requisite:** TAM-129. Pairs with TAM-120 (entity page sweep) — lay out these two pages once, with this ticket.
- **Description:**
  The entity's authoring loop becomes one page. `/entity/courses/[courseId]/content` opens with the course editor framed inside the shell, editing on, and the D-061 read-back next to it — so the entity adds sections, files, videos and the quiz, watches "activities / quiz / completion criteria" update, and publishes without ever seeing Moodle's own frame.

  **1. The page.** Page header: course title, the status Tag (draft / published / …), and the page's single action in `PortalPage`'s `action` slot — **«نشر الدورة»** when unpublished and not blocked, **«إلغاء النشر»** when published (the same `entityApi.publish/unpublish` calls and the same blocker rules as Manage Course; if blocked, the action is disabled and the blockers are listed in the read-back strip). Below the header: a compact **read-back strip** (activity count · quiz present · completion criteria configured · last refreshed), the D-061 warning inline when completion criteria are missing — that warning is the reason the read-back exists and now sits beside the editor that fixes it. Then the **iframe**, full width of the content column, height = viewport minus shell header and page header (`min-height` for 360px). `title` = the course name; `allow="fullscreen"`; `referrerpolicy="strict-origin"`; **no `sandbox`** (Moodle needs scripts, forms and its own origin).

  **2. Launch and ready.** On mount, `POST …/author-launch { embed: true }` (never prefetched, never rendered before it resolves — D-045's reasoning); mount the frame with the returned URL. The plugin consumes the nonce on first load, so the `src` left in the DOM is a **spent** token — note this in the decision that amends D-045's "never in the page" (the DOM never holds a _live_ credential). `LoadingState` covers the frame until `tamkeen:ready`; if it has not arrived in ~8s or the frame errors, swap to `ErrorState` with one recovery, **«فتح في موودل»**, which calls `author-launch` again _without_ `embed` (the first token is spent) and `window.location.assign`s — today's handoff, unchanged. The same link sits quietly under the frame at all times as a secondary action.

  **3. Read-back refresh.** On `tamkeen:content-changed` (origin checked against `MOODLE_BASE_URL`'s origin — a message from anywhere else is ignored) refetch the read-back; keep the manual «تحديث». Because the publish action reads the same data, blockers clear on the page the entity is looking at.

  **4. Manage Course** (`/entity/courses/[courseId]`): the "author in Moodle" card becomes a link, **«تحرير المحتوى»** → the content page; no launch is minted from Manage anymore (one place, one audit trail). Metadata region untouched. The publish card stays (it is where an entity who only changed metadata publishes), using the one shared `PublishAction` component so the rules live once.

  **5. Scoping unchanged.** `author-launch` still resolves the entity scope; a course the entity does not own answers exactly what it answers today; a learner or admin account never reaches `/entity/*` (D-065/D-067 guards).

  **Acceptance:**
  - An entity opens Course Content, sees its course in editing mode inside the shell (no Moodle navbar/footer/breadcrumb; secondary course nav and course index present), adds a section, uploads a file, creates a quiz with questions, sets a completion criterion — all in-frame; the read-back strip updates without a reload; the D-061 warning disappears; «نشر الدورة» enables; the course publishes and appears in the learner catalogue (existing e2e).
  - The launch URL is absent from the markup before the launch resolves and present only as the frame `src` after (component test, replacing the current "never present" assertion for this page).
  - A spoofed-origin message changes nothing (unit test). Blocked framing yields the fallback state within the timeout, and «فتح في موودل» uses a fresh token (two distinct `author-launch` calls asserted).
  - Manage Course no longer mints a launch; its publish card and the content page's action share one component and one blocker list (asserted).
  - Loading / error / blocked states present; `entity-*.test.tsx` updated for the moved action; axe on both pages at 360/768/1280; no horizontal overflow from the frame.
  - Docs: decision entry (one page for the authoring loop; publish reachable from both pages, one component; D-045 amendment); CLAUDE.md §4B.3/§4B.4 updated (Course Content is the editor, not a launch button); progress.md.

  **Implementation notes (verified):**
  - Pages: `apps/web/src/app/(entity)/entity/courses/[courseId]/content/page.tsx` (launch at ~line 127 via `window.location.href`; read-back shape `{ activityCount, hasQuiz, completionConfigured }` at line 80; its header comment says "deliberately thin: a launch and a read-back" — rewrite) and `…/[courseId]/page.tsx` (author launch ~line 111; `PublishCard` at ~line 319 with `publishBlockers`, `canPublish`, and the remount-on-change pattern described at line 49 — extract it to the shared component rather than duplicating).
  - `PortalPage` already has the `action` slot (§3's single primary action) — use it; do not add a second button row.
  - Moodle's file picker, TinyMCE and drag-drop upload work inside a same-site iframe; pages that navigate `window.top` (LTI/SCORM players) are out of scope — note it.
  - Rejected: two actions in the header (publish + open in Moodle) — one primary action, the fallback is secondary; auto-publishing when blockers clear (publishing is the entity's decision, D-059); polling the read-back on an interval (the plugin message exists for this; keep only the manual refresh).

## TAM-140 — Bug: the entity sidebar marks «الرئيسية» active on every entity page (two active items at once) — **DONE** (on `feature/tam-139-entity-content-embed`, at the user's direction)

- **What shipped (2026-08-25):** `activeNavHref(pathname, hrefs)` in `nav-items.ts` — **longest matching href wins** (segment-aware via `navPathMatches`, trailing slashes normalised, the `/` special case deleted): a dashboard is the root of its portal and matches everything by prefix, so "equal or nested" alone cannot single it out; longest-match does, with no per-portal exception. Used by `SidebarNav`; five unit cases in `nav-items.test.ts`.

- **Labels:** `bug`, `entity`, `app-chrome`, `frontend`, `a11y`
- **Priority:** High (visible on every entity page; also an accessibility defect — two `aria-current="page"` links)
- **Pre-requisite:** none
- **Description:**
  On any entity page other than the dashboard — e.g. «المتدربون» — the rail shows **two** items in the active treatment: the page's own item _and_ «الرئيسية» (screenshot 2026-08-25, learners page: both carry the tinted ground, primary start-edge bar and primary text). The dashboard item is `href: '/entity'`, and the rail decides "active" by `pathname.startsWith(item.href)`, so `/entity` matches `/entity/learners`, `/entity/courses/…`, `/entity/profile` — everything. The learner rail does not show this only because its dashboard is `/`, which has an explicit exact-match special case (`sidebar-nav.tsx:60`: "Exact match for the root so it isn't marked active on every route"). The entity portal (D-065) has its own root, and the special case never learned about it.
  **Fix:** make the rule structural rather than a list of exceptions — an item is active when the pathname **equals** its href **or starts with `href + '/'`** (segment-aware prefix). That keeps `/entity/courses` active on `/entity/courses/abc/content` (correct: a nested page belongs to its section) while `/entity` is active only on `/entity` itself, and `/` only on `/`. Delete the `item.href === '/'` special case; the general rule covers it. A trailing slash in the pathname, if Next ever hands one, should not defeat the equality — normalise once.
  **Acceptance:**
  - On every entity route exactly **one** rail item is active and carries `aria-current="page"` — asserted for `/entity`, `/entity/courses`, `/entity/courses/[id]`, `/entity/courses/[id]/content`, `/entity/learners`, `/entity/profile`.
  - The learner rail's behaviour is unchanged and asserted the same way (`/`, `/courses/[id]/player`, `/my-path`, `/profile`).
  - A unit test on the active-match helper (extract it: `isNavItemActive(pathname, href)`) covering: exact, nested segment, sibling prefix (`/entity` vs `/entityx` → not active), root.
  - No visual change to the active treatment itself (D-097); the screenshot at 360/768/1280 shows one highlighted item.
    **Implementation notes (verified):**
  - `apps/web/src/components/layout/sidebar-nav.tsx:60` — the one line: `const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);`. Items: `entity-nav-items.ts:16` (`/entity`), `nav-items.ts:47` (`/`).
  - Both rails render through the same `SidebarNav` (`AppShell`, D-097), so one fix covers both portals; the horizontal (mobile) orientation uses the same `isActive`.
  - Rejected: adding `'/entity'` to the exact-match exception list — the admin portal (Phase 5, `/admin`) would need the next exception, and the next; the segment-aware rule needs none.

## TAM-141 — Path membership rules for a course: cap of 3, RIASEC coherence, admin approval, and «عامة» courses — **entity half DONE** (on `feature/tam-139-entity-content-embed`, D-116)

- **What shipped (2026-08-25):** `path-membership-rules.ts` (pure: cap → coherence → grandfather remove-only → general exemption; 9 unit cases) used by `replacePathMembership`; `PathCourse.status/decidedById/decidedAt` + `Course.isGeneral` (migration `20260825140000`); settings `COURSE_MAX_PATHS=3`, `COURSE_MAX_RIASEC_LETTERS=2`, `PATH_MEMBERSHIP_APPROVAL=off` (env, `SETTING_KEYS`, admin labels/hints/validation strings); learner-facing readers filter APPROVED; `EntityCourseDetail.pathRules` + `isGeneral`, `paths[].status`; the metadata form disables checkboxes at the cap / on a third letter / when frozen with the reason in the accessible name, shows «بانتظار موافقة الإدارة» and the «عامة» note, live letters preview; `blockerNO_PATH` names the cap. Errors `PATH_LIMIT_EXCEEDED` / `PATH_MIX_INCOHERENT` / `PATH_MEMBERSHIP_FROZEN` in the catalogue. Tests: 4 e2e cases (47 green), 5 component cases, API 610 / web 511 green. **Left for Phase 5, schema-ready:** the approval queue in Path Management, setting «عامة» in Course Oversight, and turning `PATH_MEMBERSHIP_APPROVAL` on.

- **Labels:** `entity`, `paths`, `product-rule`, `backend`, `frontend`, `phase-5`
- **Priority:** High (a product-rule hole: today an entity can put one course into all 12 paths)
- **Pre-requisite:** none for the entity half; the approval queue and the «عامة» flag land with Phase 5's Path Management / Course Oversight (§4C.4, §4C.5) and System Settings (§4C.6)
- **Decisions taken 2026-08-25 (record in decisions.md when built):** cap **3**; membership chosen by an entity is a **proposal that an admin approves**; cross-cutting courses exist, as an admin-only **«عامة»** flag; existing courses over the cap are **grandfathered**.
- **Description:**
  A course may belong to more than one path (§2 — a modelling fact so a shared course is not duplicated), and today the only rule is "at least one" (`NO_PATH`). Ticking every path is therefore legal, and it breaks three things at once: the course's RIASEC letters are derived from its paths (D-066), so twelve paths make it all six letters — no signal; every path's 5–10 build list then carries the same generic course, so paths stop being curated tracks; and path membership is _path_ content the admin owns (§4C.4), yet an entity has just edited all twelve paths. Four rules:

  **1. Cap (entity + server).** A course may be a member of at most **3** paths. The metadata form disables the remaining checkboxes at the cap with a hint («الحد الأقصى 3 مسارات»); the server rejects an over-cap `pathIds` with `PATH_LIMIT_EXCEEDED` (400, in the shared `errors` catalogue → Arabic via `useErrorMessage`). The number comes from a new setting `COURSE_MAX_PATHS` (default 3; editable in Phase 5 §4C.6, read through `SettingsService` like `PASS_THRESHOLD`).

  **2. Coherence (entity + server).** The chosen paths must not give the course more than **2** distinct RIASEC letters — the cap alone does not protect the Holland signal (three paths from R, S and C still smear it). Server: `PATH_MIX_INCOHERENT`; form: the letters preview already on the page (`riasecLetters`) turns into the live check — as soon as a third letter would appear, the offending checkboxes are disabled with «لا يمكن الجمع بين أكثر من نمطين مهنيين».

  **3. Approval.** What an entity saves is a **proposal**: `path_courses` gains `status: PENDING | APPROVED` (+ `decidedById`, `decidedAt`). Only APPROVED rows count for the learner catalogue, path build, `riasecLetters` and the `NO_PATH` blocker; PENDING rows show on Manage Course as «بانتظار موافقة الإدارة» and on the entity dashboard's pending list. Removing a membership needs no approval (an entity may always withdraw its own course from a path — course-edit protection D-040 still applies if learners hold it). The admin decides in **Path Management** (§4C.4) — a per-path queue with approve/reject and an optional reason returned to the entity; every decision audited. **Until Phase 5 ships**, proposals are **auto-approved** behind a setting `PATH_MEMBERSHIP_APPROVAL=off` so the entity flow keeps working; switching it on is the Phase 5 launch step. This is the one place the ticket depends on Phase 5, and it degrades cleanly.

  **4. «عامة» — cross-cutting courses (admin only).** A course the admin marks `isGeneral` appears in **every** path's build list and catalogue path-filter without any `path_courses` rows, carries no derived RIASEC letters (it is shown with «عامة» instead of a type), and is exempt from rules 1–2. Entities cannot set or clear it; Manage Course shows it read-only. Set from Course Oversight (§4C.5). Recommendation ranking is untouched (it reads path letters, not course letters).

  **Grandfathering.** Courses already over the cap or incoherent keep their current memberships (learners may hold them in confirmed paths — D-002/D-040 forbid pulling them). They may **remove** memberships but not add until they are within the rules; the form says so («هذه الدورة تتجاوز الحد الحالي؛ يمكنك إزالة مسارات فقط»). No migration rewrites `path_courses`.

  **Copy:** `blockerNO_PATH` → «أضف الدورة إلى مسار واحد على الأقل (بحد أقصى 3).»; new strings for the cap hint, the coherence hint, the pending state, the grandfather note, «عامة».

  **Acceptance:**
  - Server: `PATCH /api/entity/courses/:id` with 4 paths → 400 `PATH_LIMIT_EXCEEDED`; with 3 paths spanning 3 letters → 400 `PATH_MIX_INCOHERENT`; with 3 paths in 2 letters → 200 (e2e). A grandfathered course: removing a path → 200, adding one → 400 with the grandfather error.
  - Form: 4th checkbox disabled at the cap; a checkbox that would add a third letter disabled, with the hint; the letters preview reflects only approved memberships (component tests).
  - Approval off (default now): saving creates APPROVED rows and behaviour is as today — the existing phase-4 browser suite stays green unchanged. Approval on (Phase 5): rows are PENDING, the course is absent from the learner catalogue/path build until approved, and `NO_PATH` blocks publishing; approving in Path Management flips it, audited.
  - `isGeneral` course: present in every path's build list and in the catalogue's every path filter; no letters; entity cannot change it (403); counts toward a learner's 5–10 like any course.
  - Docs: decision entry (the four rules and why each); CLAUDE.md §2 (add the cap + coherence beside the "one course, multiple paths" rule), §4B.3, §4C.4/§4C.5/§4C.6; progress.md.

  **Implementation notes (verified):**
  - Rule today: `apps/api/src/entity/publish-readiness.ts:37` pushes `NO_PATH`; `UpdateEntityCourseDto.pathIds` (`entity.dto.ts:80`, UUID array, no length rule — add `@ArrayMaxSize` from the setting, or check in the service so the number is not baked into a decorator); `replacePathMembership` (`entity-course-management.service.ts:320`) rewrites `path_courses` wholesale — the natural place for cap, coherence and grandfather checks, with the old set in hand for the "remove only" rule.
  - `PathCourse` (`schema.prisma:700`, unique `[pathId, courseId]`) — add `status`, `decidedById`, `decidedAt`; every reader of `path_courses` (catalogue, path build, `riasecLetters` in `entity-courses.service.ts`, recommendation/path detail, publish readiness) must filter `status = APPROVED` — grep `pathCourses`/`path_courses` and list them in the PR; a missed reader is how a pending course leaks into a learner's build list.
  - Blocker strings live under `entity.blocker*` in `messages/ar.json:736`; error codes in the shared `errors` catalogue (D-024).
  - Settings: follow `PASS_THRESHOLD`'s path through `SettingsService` and `env.schema.ts` for `COURSE_MAX_PATHS` and `PATH_MEMBERSHIP_APPROVAL`.
  - Rejected: letting the entity mark «عامة» (it is exactly the "all paths" hole with a nicer name); cap without coherence (does not protect the Holland signal); approval without an auto-approve setting (would block entities until Phase 5 exists); a migration that trims existing memberships (touches confirmed learner paths).

## TAM-142 — What changes in the framed editor shows in the portal at once: per-course resync on the frame's signal

- **Labels:** `moodle-embed`, `entity`, `backend`, `frontend`, `moodle-plugin`
- **Priority:** High (the framed editor makes the five-minute lag visible: an entity renames the course in the frame and the portal header keeps the old name)
- **Pre-requisite:** TAM-129 + TAM-139 (the frame and its `tamkeen:content-changed` message)
- **Description:**
  Two kinds of course data reach the portal by two routes, and only one of them is immediate. The **structure** read-back (activities, quiz, completion criteria) is read live from Moodle (`readContent`, `core_course_get_contents`) and the Content page refetches it when the frame posts `tamkeen:content-changed`. The **title, description and visibility** are a cached copy in `courses`, refreshed only by the full catalogue sync every `COMPLETION_SYNC_INTERVAL_MINUTES` (5 min) — so a rename made in the frame at 13:31 appears at 13:35, and until then the Content page header, Manage Course, «دوراتي» and the learner catalogue all show the old name. Observed 2026-08-25.
  Close the gap in three parts:

  **1. Plugin — the frame also signals course-level edits.** `db/events.php` observes only course-module / section / completion events; add `\core\event\course_updated` (name, summary, visibility, format changed via the Settings tab) so the same `tamkeen:content-changed` message fires. One message type is enough — the portal reacts the same way to both.

  **2. API — a per-course resync, not a full catalogue run.** `POST /api/entity/courses/:id/resync` (entity-scoped like every other course route; audited as `ENTITY_COURSE_RESYNCED`) reads that one course from the LMS (`core_course_get_courses_by_field` by id — already on the external service) and applies the **same mapping and the same upsert the catalogue sync uses** (`catalog-mapping.ts`, the `course.upsert` in `catalog-sync.service.ts:145`) — extract `syncOne(moodleCourseId)` from `sync()` rather than writing a second path, so the two can never map a field differently; `status` still derives through the one function D-059 names. Returns the refreshed `EntityCourseDetail` (with `content`) so the page needs no second request. Rate-limited per user (e.g. 30/min) — the frame can emit several messages in a burst; the handler should also **coalesce** (a resync already in flight for the course answers the second caller with the same result).

  **3. Web — the Content page and Manage Course call it.** On `tamkeen:content-changed` and on «تحديث», the Content page calls `resync` instead of `getCourse`, so title, description, status, read-back and publish blockers all refresh together from one response; Manage Course's «تحديث» (add one, quiet, beside the status line) does the same. The learner-facing copies («دوراتي» list, catalogue) simply read the updated row. The scheduled catalogue sync stays as the safety net for edits made outside the frame.

  **Courses created directly in Moodle.** An entity in the framed editor cannot reach "create course" (the primary nav is hidden), and D-060 makes the portal the only place a course shell is created — a course born in Moodle has no owner and is a Phase 5 admin matter (Course Oversight shows it as unclaimed). This ticket does **not** auto-claim such courses for an entity; note it in the decision so nobody adds it later as a convenience.

  **Acceptance:**
  - Rename the course in the frame's Settings tab → the Content page header shows the new name within ~2 s, no reload; Manage Course and «دوراتي» show it on their next load; the learner catalogue shows it (if published).
  - Adding an activity still refreshes the read-back; both signals arrive through the one message (plugin test: `course_updated` sets the session flag).
  - `POST …/resync` on another entity's course → the same refusal as every scoped route; rate limit returns 429 past the ceiling; two concurrent calls produce one LMS read (coalescing asserted in a unit test); the response equals `GET …/courses/:id` afterwards (e2e).
  - `syncOne` and `sync()` share the mapping — a unit test feeds both the same LMS course and asserts identical rows; the scheduled sync's own tests stay green unchanged.
  - Audit entry per resync; no new PII in it.
  - Docs: decision entry (per-course resync as the immediate path, scheduled sync as the net; Moodle-born courses stay unclaimed); CLAUDE.md §4B.4 sentence; progress.md.

  **Implementation notes (verified):**
  - `catalog-sync.service.ts:82` `sync()` does the LMS read + mapping + upsert inline (`withdrawVanished` at 198 is the full-run-only part — a per-course sync must **not** withdraw anything). `readContent` is in `entity-course-management.service.ts:230`; the content route at `entity.controller.ts:126`.
  - The Content page (`…/content/page.tsx`) already funnels both the message and «تحديث» through one `refresh` callback — swap its target from `getCourse` to `resync`; `MoodleEmbed` needs no change.
  - Plugin observers: `moodle-plugin/local_tamkeensso/db/events.php`; the flag→message path in `hook_callbacks.php` is already generic.
  - Rejected: shortening the scheduled interval (a full 78-course sync every minute to serve one editor); polling from the page (the frame already knows when something changed); webhooks from Moodle to the API (a new inbound surface to secure for a problem the existing message solves).

## TAM-143 — Entity authoring guide: how to create a course and add its content (videos, documents, images, quiz, completion), in the portal and in the repo — **DONE, screenshots owed** (on `feature/tam-139-entity-content-embed`, D-117)

- **Merge note (2026-08-27):** the guide landed on `main` independently at `/entity/guide` rendered by `lib/markdown.ts`; this branch’s duplicate route (`/entity/courses/guide`) and `lib/simple-markdown.ts` were dropped in the merge. See D-117’s amendment.

- **What shipped (2026-08-25):** `docs/entity-authoring-guide.md` (Arabic; create → بيانات → editor → content by kind: video/documents/images/text → quiz → completion, both halves the read-back checks → publish → limits & faults); `lib/simple-markdown.ts` (zero-dep subset converter, escaped, 4 unit cases) and `/entity/courses/guide` (server-rendered from the file, TOC from the `##` headings, error state if the file is missing); «دليل إنشاء الدورة» links on the create card and the Content page; «كيف؟» on each blocker whose fix is in the guide (completion → `#completion`, the metadata four → `#metadata`; `LMS_UNREACHABLE` has none). The course **description** now shows under the title on the Content page and Manage Course. Web suite 517 green. **Owed:** screenshots (needs the Arabic pack on Moodle), the PR-template line, and the timed 30-minute acceptance run with a fresh entity.

- **Labels:** `entity`, `docs`, `moodle-embed`, `frontend`
- **Priority:** Medium (nothing is broken; but every entity will hit the same four questions we hit on 2026-08-25, and the framed editor hides the Moodle help that used to answer them)
- **Pre-requisite:** TAM-139 (the framed editor is what the guide describes); the Arabic language pack installed on the target Moodle (otherwise the guide's Moodle labels are English)
- **Description:**
  An entity's whole job is "create a course, put content in it, publish". Today the path is discoverable only by trial: which Moodle activity carries a video, where a PDF goes, how an image reaches a page, how to add a quiz with questions, and — the one that blocks publishing — where completion criteria are set (D-042/D-061). Write the guide **once, in Arabic, for the framed editor**, and put it where the entity is when the question arises.

  **1. The guide (`docs/entity-authoring-guide.md`, Arabic, with screenshots of the framed editor).** Sections, each one screen long:
  - **إنشاء الدورة** — «إضافة دورة» in the portal (name, description, language), not in Moodle (D-060); what happens (a shell in Moodle, a draft in the catalogue).
  - **بيانات الدورة** — paths (at most 3, within two RIASEC letters — D-116), duration, objectives, language; why these live in the portal and not in Moodle.
  - **فتح محرّر المحتوى** — the framed editor; what is hidden and why; the course navigation and course index; «افتح في منصة التعلّم» if the frame does not load.
  - **إضافة المحتوى**, one recipe per kind:
    - **فيديو** — three routes and when to use each: **URL** to a hosted video (recommended for anything over a few minutes — the LMS is not a video host); **File** upload (`.mp4`, plays inline; note the upload ceiling below); **Page** with the video embedded through the editor's media button (video with text around it).
    - **مستندات** — **File** (`.pdf`, `.docx`, `.pptx`); "display: open / embed"; one file per resource, or a **Folder** for a set.
    - **صور** — inside a **Page** (or a Book chapter) through the editor's image button — with **alt text**, which the WCAG obligation (§2B DoD 5) makes mandatory; a bare image file as a resource is the exception, not the rule.
    - **نص** — Page (one screen) or Book (chapters).
  - **الاختبار** — Quiz → Add question → Multiple choice (and true/false, matching); marks; the grade to pass; attempts; shuffle. What "شروط الإكمال" on the quiz means (receive a grade / passing grade).
  - **شروط الإكمال** — the two halves the read-back checks (course completion tracking on; at least one activity with a condition), then **Course completion** → activity completion → the quiz, so the learner's course actually completes and the certificate can be issued (D-042). This is the section the blocker «اضبط شروط إكمال الدورة» links to.
  - **النشر** — the read-back strip, the blockers and what each means, «نشر الدورة»; what learners see, and what «أوقف النشر» does to learners who hold the course (D-059).
  - **الحدود والأعطال** — upload ceiling (Moodle's `maxbytes` / PHP `upload_max_filesize` — state the real numbers per environment; the local compose sets nothing, so PHP's default 2 MB applies until Phase 7 fixes it — record that as a Phase 7 item), supported video formats, "the frame shows a blank page / the read-back does not change" → «تحديث» and the fallback.

  **2. In the portal, at the point of need.** A quiet «دليل إنشاء الدورة» link (Platforms Code link style, no icon soup) in three places: the create-course card, the Content page's read-back strip, and each publish blocker whose fix is in Moodle links straight to its section (the completion blocker → «شروط الإكمال»). Served as a portal page `/entity/guide` rendered from the markdown (one source; no second copy in `ar.json`), with the headings as anchors.

  **3. Keep it true.** The guide is checked by the same eyes that change the editor: any PR touching `moodle-plugin/`, the Content page, or publish readiness must re-read the affected section — add a line to the PR body template. Screenshots are regenerated when Moodle is upgraded (Phase 7's pinned 4.5.x).

  **Acceptance:**
  - A new entity account, following only the guide, creates a course with a video (URL), a PDF, a page with an image (with alt text), a five-question quiz, completion criteria, sets the metadata and publishes — no help from us. Timed; under 30 minutes.
  - Every publish blocker with a Moodle-side fix links to the section that fixes it; the link opens the guide at that heading.
  - The guide reads correctly RTL, in the Arabic Moodle UI labels (language pack installed), screenshots included.
  - The upload ceiling stated matches what the environment enforces (verified by uploading a file just over it and reading Moodle's message).
  - Docs: progress.md; Phase 7 note for `maxbytes`/PHP upload limits and the language pack in the deployment setup.

  **Implementation notes (verified):**
  - What the read-back actually checks (`moodle-http.service.ts:439–447`): `enablecompletion` on the course **and** any module with `completion > 0`. The guide must say both, in that order — the 2026-08-25 session lost time because the quiz was configured and the read-back still said no (that turned out to be a capability bug, fixed in `moodle-setup.php`; the guide should still include «اضغط تحديث» as the first thing to try).
  - Blocker strings live under `entity.blocker*` in `messages/ar.json`; `BlockerList` renders them — the link per blocker goes there.
  - Moodle activity names in the Arabic pack (for the screenshots): ملف، صفحة، رابط، مجلد، كتاب، اختبار. Confirm after the pack is installed; do not translate them by hand.
  - Rejected: writing the guide as Moodle-side help (the frame hides Moodle's chrome, and the ministry may not accept custom PHP for it — D-044); a video walkthrough as the only form (not searchable, not RTL-checkable, goes stale on the first Moodle upgrade); copying the guide text into `ar.json` (two sources).

## TAM-144 — Entity profile: edit the contact details (and the account name), the same form pattern as the learner profile — **SUPERSEDED** by TAM-138 (entity profile shipped on `feature/tam-110-change-password`, D-108)

- **Labels:** `entity`, `profile`, `frontend`, `api`
- **Priority:** Medium
- **Pre-requisite:** none. **Pairs with TAM-109's edit half** (learner name + department) — build the two on one shared "بياناتك" card pattern; whichever lands first sets it.
- **Description:**
  §4B.6 says "Organization info and contacts. Minimal." Today `/entity/profile` is a read-only `<dl>` of three rows (اسم الجهة، اسم جهة الاتصال، بريد جهة الاتصال) and a line saying it is read-only. There is no `PATCH`; `EntityProfileService` has only `get`. An entity that changes its contact person has to ask us. Make the page the same shape as the learner profile (TAM-109): a card of labelled fields, the editable ones in the DGA form primitives (`Input`, `Field`, TAM-101), one **حفظ**, a polite saved confirmation, field errors from the server.

  **What is editable, and what is not — decided here, record in decisions.md:**
  - **Editable by the entity:** `contactName`, `contactEmail` (the organisation's own contact person), and **the signed-in account's own display name** (`users.fullName` for the entity user — the name in the header's identity line).
  - **Not editable by the entity:** `Entity.name` (the organisation's official name — it appears as the course owner in the catalogue and, from Phase 5, in reports; renaming a government body is the admin's act, §4C.2), `key`, `status`, and the account email (TAM-111's re-verification flow applies to entity accounts too — reuse it, do not add a second one).
  - Shown read-only beside the editable fields: اسم الجهة, the account email, الصلاحية («جهة»).

  **API.** `PATCH /api/entity/profile` (`@Roles('ENTITY')` only — a super-admin edits entities in §4C.2, not here) with `{ contactName?, contactEmail?, fullName? }`: trimmed, `contactName` ≤ 120, `contactEmail` a valid address ≤ 254, `fullName` ≥ 3 (same rule as registration); a patch, so an omitted field is untouched. Writes `contactName/contactEmail` on `entities`, `fullName` on `users`; audits `ENTITY_PROFILE_UPDATED` with **which fields changed, never the values** (§6 PII discipline, as `ENTITY_COURSE_METADATA_UPDATED` does). Returns the refreshed `EntityProfileView` (add `accountFullName` and `accountEmail` to it).

  **Name to Moodle.** An entity user is provisioned in Moodle as `editingteacher` (D-060) and Moodle shows that name to nobody but the entity itself inside the framed editor — still, keep it consistent: propagate `fullName` through the same `LmsPort.updateUser` TAM-109 introduces (do not add a second path; if TAM-109 has not landed, this ticket adds `updateUser` and TAM-109 reuses it).

  **Acceptance:**
  - Page shows اسم الجهة (read-only), اسم جهة الاتصال + بريد جهة الاتصال + اسمك (editable), بريدك (read-only, with the "change email" entry point once TAM-111 exists), الصلاحية; one حفظ; saved confirmation survives the refetch (the `course.data === undefined` guard pattern from Manage Course).
  - `PATCH` validates (empty contact name, malformed email, 2-char full name → 400 with field codes); audit entry has fields, not values; a learner or admin session → 403 (e2e).
  - After saving, the header identity line shows the new account name without a full reload (refresh the session user the way TAM-109 does).
  - Moodle's record for the entity user carries the new name (contract test against the mock).
  - Loading / error states; labelled inputs; keyboard-complete; RTL at 360 px; `entity-profile` component test + the phase-4 browser suite's "profile is read-only" step rewritten to "edits the contact and sees it saved".
  - Docs: decision entry (what an entity may edit and why the organisation name is not on the list); CLAUDE.md §4B.6 one sentence; progress.md.

  **Implementation notes (verified):**
  - Page: `apps/web/src/app/(entity)/entity/profile/page.tsx` — `Row` + `profileReadOnly` string; replace with the form. Service: `apps/api/src/entity/entity-profile.service.ts` has `get(scope)` only; controller routes carry `@Roles('ENTITY', 'SUPER_ADMIN')` at class level (`entity.controller.ts:62`) — the PATCH needs a **method-level** `@Roles('ENTITY')` override, and a test that the admin is refused.
  - Model: `Entity { name, key, contactName @default(""), contactEmail @default(""), status }` (`schema.prisma:678`); no migration needed.
  - Types: `EntityProfileView { id, name, contactName, contactEmail }` (`packages/types/src/entity.ts:13`) — add the account fields.
  - Strings: `entity.profile*` in `messages/ar.json`; error codes go through the shared catalogue (D-024) → `useErrorMessage`.
  - Rejected: letting the entity rename the organisation (admin's act; it is the name on the catalogue and, later, on reports); a separate "contact" sub-page (§4B.6 says minimal — one card); free-text role/title fields for the contact (not asked for; PII minimisation).

## TAM-145 — Learner course player: the course inside the page, the handoff as fallback — **DONE** (at the user's direction, on `feature/tam-139-entity-content-embed`, D-118)

- **Labels:** `moodle-embed`, `frontend`, `backend`, `moodle-plugin`
- **What shipped (2026-08-25):** plugin 0.3.0 — `embed=learner` (no editing; navbar, footer, breadcrumb **and course tabs** hidden; course index kept) and `tamkeen:quiz-finished` from the quiz review page; `LaunchOptions.embed: 'author' | 'learner'`; `POST /api/courses/:id/launch { embed }` → `{ url, mode }`; `POST /api/courses/:id/sync` (per-learner on-demand completion sync, 10 s cooldown, same `syncUser` as the schedule); `components/moodle-embed.tsx` shared by the entity Content page and the player (labels + launches injected); the player keeps its header (path context, description, outcome) and frames the course beneath, fallback under it. Tests: player suite rewritten (URL absent before launch / only as frame src after; frames nothing before commitment; quiz message → sync + refetch; foreign origin ignored; failed launch → fallback), web 519, API 209 + e2e 105. Proven live as `demo-student` on course 85.

## TAM-146 — Player: previous / next between activities, and "where am I" in the panel — **DONE** (at the user's direction, on `feature/tam-139-entity-content-embed`, D-119)

- **Labels:** `moodle-embed`, `frontend`, `backend`, `moodle-plugin`
- **What shipped (2026-08-25):** `LmsPort.getCourseOutline` (real + mock, contract case), `GET /api/courses/:id/outline` (same gate as launch), plugin 0.3.1 (`tamkeen:ready` carries `cmid`), `MoodleEmbed` exposes `navigate(url)` through a ref and reports `onReady({ moduleId })`, the player panel shows «النشاط n من N · name» (or «صفحة الدورة · N أنشطة») with «السابق / التالي» that move the frame without a new launch and stay in step with in-frame navigation. Tests: player +2, web 521, API 164; proven live.

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

## TAM-138 — Records and reports: entries that name real things, and a page that reads as one — **DONE**

- **Labels:** `admin-records-reports`, `frontend`, `backend`
- **Priority:** High
- **What shipped:**
  1. **Two entries that named the wrong thing, or nothing.** `LMS_COURSE_PASSED` stored the _Moodle_ course id under `targetType: 'course'`, so §4C.8's label resolution never resolved and every pass read «دورة: 12»; it now records our course id, and no target at all when the catalogue has since lost the course. `EnrollmentService.auditFailure` took a `targetId` with no `targetType`, and the screen renders a target only when it knows the kind — so every refused path-building attempt appeared with no subject. `targetType` is now required there, which forced each call site to say honestly whether the id it holds is a path or one learner's journey through one (D-106).
  2. **Actions have a category.** `AUDIT_ACTION_CATEGORY` maps all fifty-three to five areas, exhaustive by type. The filter is grouped by it — fifty-three options in one flat list is not a filter anybody uses.
  3. **Values in words, not codes.** The detail keys were translated and the values were not: rows read «الحالة: HIDDEN_BUT_COMPLETABLE», «الدور: SUPER_ADMIN», «الحقول المعدَّلة: department,fullName». Now a coded value is Arabic, a comma-joined list is split and each part translated, a boolean is «نعم»/«لا», and a Holland code is spelled out in the six type names. A route on an `AUTHZ_DENIED` entry still falls through as itself — that is the entry's point.
  4. **A period.** The API has accepted `from`/`to` since §4C.8 was built and nothing offered them; the screen now has both, and every filter clears the cursor.
  5. **The export says what the screen says.** It is built in the browser now — every column of it is Arabic copy — over the shared `toCsv`, which moved to `packages/types` so the browser and the reports export use one implementation of the BOM, the quoting and the formula guard. `/api/admin/audit.csv` is gone (D-107).
  6. **The report that was computed, exported and never shown.** §4C.8 asks for the Holland-code distribution; the API has always returned it and the CSV has always carried it. It is on the page now, spelled out in Arabic type names — and the journey stats show all six stages the export reports rather than four of them, so the file and the page stop disagreeing.
- **Acceptance met:** 3 new unit tests on the category map (exhaustive both ways, and that no constant's name has drifted from its code); 1 on the completion-sync target; 2 new integration tests (an export-sized page honours its filter, and the bound is enforced); 7 new page tests (translated values, the grouped filter, the date filter clearing the cursor, the browser-built export and its failure state, the distribution, the six stages); a new browser test that really downloads the file and reads its bytes. **Full suites run this session:** 648 API unit · 670 web component · 554 API integration against real PostgreSQL · 114 browser tests in Chromium against the built apps, 113 passing — the one failure is a pre-existing flake in `phase-5-profile` that passes on re-run and is in a file this work never touched.
- **Note on the totals:** the API unit count fell by nine and the integration count by three against TAM-137's figures because `csv.spec.ts` moved into `packages/types` (where it now runs among 51) and the trail-CSV endpoint test was replaced by two narrower ones.

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
