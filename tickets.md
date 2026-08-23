# Tickets

> Format: **Title → Priority → Pre-requisite → Description**. Tickets sharing a label belong to the same epic.
>
> **Baseline:** all "verified" implementation notes were re-checked against `main` @ `f1f0dcd` (2026-08-23), which now includes Phase 3 (certificates + CV, PR #4), the public landing page (PR #5, built from the reference design), and Phase 4 (entity portal, PR #6). Phase 5 (super-admin) is next. Re-verify notes again if `main` moves before a ticket is picked up.
>
> **Epic label: `auth-ui-port`** — rebuilding the sign-in/sign-up screens (wired, functionality unchanged) for ministry requirements. **Re-based 2026-08-23 on the DGA's Platforms Code (see the `dga-alignment` epic): the design source is now the official Platforms Code templates/components, not the reference repo.** The reference repo (`AhmadIbrahiem/frontend`, `master`) remains useful only for the *interaction* ideas already approved — the two-step registration wizard, input treatment — where Platforms Code has no prescribed pattern. Shared ground rules for every ticket in this epic:
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

## TAM-101 — Auth shell: two-panel `AuthLayout` + placeholder Arabic copy

- **Labels:** `auth-ui-port`, `frontend`, `design-system`
- **Priority:** High (blocks every other ticket in the epic)
- **Pre-requisite:** TAM-115 (Platforms Code tokens)
- **Description:**
  Build the shared auth shell all five auth screens will sit in. **First check whether Platforms Code prescribes a sign-in/registration template; if it does, that template is the shell.** Otherwise use the approved split layout: a ministry-branded panel (emblem — D-051 placeholder until supplied — tagline, 3 feature bullets) beside the form panel, built from Platforms Code components and tokens. Collapses to a single column below `md`; verified usable at 360px.
  Draft ministry-training-toned **placeholder** Arabic copy for the panel (realistic sentence length, no Lorem Ipsum, no machine translation) in `messages/ar.json`, clearly marked placeholder until the Training Directorate delivers final copy.
  Record the decision: the two-panel layout amends CLAUDE.md §4.1's "single-column, centered" — add the `decisions.md` entry.
  **Acceptance:** shell renders RTL-correct at 360/768/1280px; catalog test still passes (no empty strings, no stray English, no hardcoded digits); axe/manual a11y check clean; no physical-direction Tailwind classes anywhere in the new code.
  **Implementation notes (verified against the repo):**
  - Reference layout to port (`src/pages/Login.tsx` ~line 620): brand panel hidden below `lg`, `lg:w-[44%]`, decorative geometric pattern, small ministry label → large display text → description → 3 feature rows (icon in a gold-tinted rounded square + label) → tagline. Form panel is flat (no card), with a compact brand bar shown only on mobile.
  - Put the brand panel FIRST in DOM order: with RTL logical flow it lands on the start (right) side with zero physical classes. Panel = `<aside>` (complementary landmark), form area = `<main>`. Keep exactly ONE `h1` = the page title in the form panel; the panel's display text must NOT be a heading (AuthCard history: duplicate headings get announced twice by screen readers).
  - `lucide-react@1.31.0` is already a dependency; `ClipboardCheck`, `Compass`, `Award` all exist for the three feature icons. All svgs `aria-hidden`.
  - `tw-animate-css` is already imported in `globals.css` — use `animate-in fade-in duration-200 motion-reduce:animate-none` for the mount fade. No framer-motion.
  - Token classes: **use the Platforms Code semantic tokens from TAM-115** (the panel on the system's primary/dark surface, text and icon chips on its documented pairings). The navy/gold class names in earlier drafts are obsolete. Never hardcode hex; every pairing must be one the rewritten contrast test covers.
  - New copy goes under `auth.brandPanel.*` in `messages/ar.json` (keys: ministry, heading, description, featureAssessment, featurePaths, featureCertificates, tagline). No digits and no English in the values or the catalog test fails the build.
  - Component tests live beside the component (vitest + testing-library, `NextIntlClientProvider` wrapper with locale `ar-u-nu-latn-ca-gregory` — see `states.test.tsx` for the pattern). Include a test that greps rendered class attributes for physical-direction classes (`ml-|mr-|pl-|pr-|text-left|text-right|left-|right-|border-l|border-r`).
  - Type gotcha: indexing a `const` array of lucide icons types as `T | undefined` under strict mode — pair icon+key in one tuple/object array so the lookup can't be undefined.

## TAM-102 — Sign-in page restyle (wired)

- **Labels:** `auth-ui-port`, `frontend`
- **Priority:** High
- **Pre-requisite:** TAM-101
- **Description:**
  Rebuild `/login` inside the new `AuthLayout` with the reference's input treatment: lucide icons inside fields (already a dependency), its spacing/focus rhythm, password show/hide toggle. Functionality is untouched: email + password, forgot-password link, CSRF double-submit flow, lockout and error mapping via `use-error-message`.
  Strip everything the reference has that we forbid: role picker, social login, demo-account quick-access buttons, "demo notice" banner.
  **Acceptance:** existing login unit + e2e tests pass unmodified; error/loading states present; full keyboard path (tab order, visible focus, submit on Enter); works at 360px RTL.
  **Implementation notes (verified):** the current page (`src/app/login/page.tsx`) already carries all behavior to preserve — `useErrorMessage` mapping, the EMAIL_NOT_VERIFIED resend branch, **role-based redirect on success (`user.role === 'ENTITY' ? '/entity' : '/'`, D-065 — entities must not land on the learner dashboard)** + `router.refresh()`, `dir="ltr"` on the email input, `noValidate` on the form, `role="alert"`/`role="status"` on error/resent messages. Swap `AuthCard` → `AuthLayout` and restyle inputs via the shared `Field`/`Input` components (extend `Input` to take an optional start-icon rather than forking per page).

## TAM-103 — Registration as a two-step wizard (wired)

- **Labels:** `auth-ui-port`, `frontend`
- **Priority:** High
- **Pre-requisite:** TAM-101 (TAM-102 recommended first for shared input components)
- **Description:**
  Rebuild `/register` inside `AuthLayout` as a two-step wizard, keeping the reference's step-wizard feel but **deleting the role picker**: **Step 1** account (email, password, confirm password) → **Step 2** employee details (full name, employee ID, department). Arabic step indicator ("الخطوة 1 من 2", western digits). Per-step client validation; one server submit at the end; back preserves entered values. Server-side rules (restricted domain, employee-ID pattern, password policy) untouched.
  A server error on submit must return the user to the step containing the offending field, with the field-level Arabic error shown.
  **Acceptance:** new unit tests for step validation, back/next value retention, and server-error → correct-step mapping; register e2e happy path updated for the wizard and green; verification email still flows through Mailpit.
  **Implementation notes (verified):** keep it ONE client component with local step state — no routing per step, so back/next retains values for free and the URL stays `/register`. Server submit only at the end via the existing `authApi`; error codes come from the shared `errors` catalogue via `useErrorMessage`, and each code maps to the step that owns its field (domain/email errors → step 1; employee-ID pattern → step 2). Step indicator uses `actions.back`/`actions.next` where possible and western digits (D-018). The e2e suite reads the verification token out of Mailpit — keep field labels unchanged so its label-based locators survive.

## TAM-104 — Secondary auth pages restyle: verify-email, forgot-password, reset-password

- **Labels:** `auth-ui-port`, `frontend`
- **Priority:** Medium
- **Pre-requisite:** TAM-101, TAM-102 (reuses the restyled input components)
- **Description:**
  Move the remaining three auth screens (`/verify-email`, `/forgot-password`, `/reset-password`) into `AuthLayout` with the same input styling, so no page is left on the old `AuthCard` design. Single-card forms; functionality unchanged (single-use hashed tokens, enumeration-resistant responses).
  Remove `AuthCard` if nothing references it afterwards; otherwise note what still uses it.
  **Acceptance:** all three flows pass their existing tests; reset-password e2e (token from Mailpit) green; loading/empty/error states intact.
  **Implementation notes (verified):** all three pages currently render through `AuthCard` (`src/components/auth/auth-card.tsx`) — after this ticket nothing should import it; delete it and its usages in the same PR so the old design can't resurface. The pages keep their enumeration-resistant behavior (always-report-sent responses) — restyle only.

## TAM-105 — Epic QA pass: RTL/a11y/responsive audit + docs

- **Labels:** `auth-ui-port`, `qa`, `docs`
- **Priority:** Medium
- **Pre-requisite:** TAM-102, TAM-103, TAM-104
- **Description:**
  Close the epic: manual browser pass over all five screens at 360/768/1280px in RTL; keyboard-only walkthrough; contrast spot-checks on the navy panel (gold usage per the Phase 0 restriction); confirm no physical-direction classes slipped in (`grep -rE "\b(ml-|mr-|pl-|pr-|text-left|text-right|left-|right-)"` over the auth surface); `prefers-reduced-motion` honored.
  Cross-check BRD §8.1 BR-101–106 once the BRD is delivered — record any gaps as new tickets rather than absorbing scope.
  Update `progress.md` (including correcting the stale "Phase 2 PR awaiting review" — PR #3 is merged) and finalize the `decisions.md` entries. Then the epic is ready for the user-approved test → PR gate.
  **Acceptance:** full suite green (unit + integration + e2e), typecheck/lint/format clean, audit findings fixed or ticketed, docs updated.

---

> **Epic label: `assessment-gating`** — focusing the pre-assessment experience on the one action that matters: starting the assessment.

## TAM-106 — Hide Courses until the assessment is finished (sidebar + deep links)

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
  **Implementation notes (verified):**
  - The gate lives in ONE function: `navForState(state)` in `src/components/layout/nav-items.ts` — change `['dashboard', 'courses', 'profile']` for the `PRE_ASSESSMENT` branch only; the shell renders whatever list it is handed. The state is decided server-side (`DASHBOARD_STATES` in `packages/types/src/journey.ts`) and loaded once by `PortalProvider` — do not re-derive it in the page.
  - Put the redirect where `PortalProvider` already owns journey state (it handles the 401 redirect the same way): when state is `PRE_ASSESSMENT` and the route matches `/courses`, `router.replace('/')`. Render the loading state while redirecting — never a flash of catalog.
  - `navForState` now has a dedicated test, `src/components/layout/nav-items.test.ts` — it currently asserts `PRE_ASSESSMENT` → `['dashboard', 'courses', 'profile']`, so it will fail on this change by design. Update that assertion (and the `sidebar-nav.test.tsx` fixtures if they assume three items); do not add a second test file.
  - `PortalProvider` now also carries `unreadCertificates` and the shell renders a certificates indicator; the redirect added here must not interfere with that load — put it after the existing 401 handling, in the same effect.
  - Watch `e2e/journey-happy-path.spec.ts`: it asserts `/courses` URLs mid-journey (lines ~117, ~182). Those steps run post-assessment so they should survive, but verify rather than assume; the new pre-assessment assertions belong in the same spec so ordering is explicit.
  - The dashboard's pre-assessment card and copy need no change — it already presents the single "ابدأ التقييم" action (§4.2).

## TAM-107 — Sidebar during the assessment + resume-within-session drafts

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
  **Implementation notes (verified):**
  - The chrome switch is one line: `src/app/(portal)/assessment/page.tsx` line ~34 passes `chrome="bare"` to `PortalPage` — remove it and the default `'nav'` chrome renders `AppShell` with `navForState(dashboard.state)`, which after TAM-106 yields the two gated items for `PRE_ASSESSMENT` automatically. No new layout code.
  - Draft state lives in `AssessmentFlow` (same file): `answers` (`Record<string, string>`) and `index` are plain `useState`. Hydrate them from sessionStorage on mount and write through on change; key by the assessment's question-id list so a changed bank invalidates the draft. Clear the key in the submit success handler (where it already calls `usePortal().refresh()` and routes to results).
  - sessionStorage is per-tab and per-origin: no PII concern (option keys only, no free text), nothing crosses users on a shared machine once the tab closes.
  - Guard the sessionStorage reads for SSR/first render (`typeof window`) — the page is a client component but hydration order still matters.
  - Retakes are allowed only pre-commitment (§2) and this draft mechanism doesn't change that — the retake path just starts with an empty draft after the previous submit cleared it.


## TAM-108 — Dashboard: Holland chips after the assessment + status strip on an active path

- **Labels:** `assessment-gating`, `dashboard`, `frontend`, `api`
- **Priority:** Medium
- **Pre-requisite:** none (independent of TAM-106/107; all three dashboard branches live in one file, so one ticket avoids two PRs colliding there)
- **Description:**
  Two of the dashboard's three states get a content change. The rule holding both together: **one primary action per screen; information may be added, competing actions and duplicated UI may not** (§3).

  **A. Assessed, no path yet (`ASSESSED_NO_PATH`).** Today the Holland Code appears as a raw Latin string inside a sentence ("ظهرت نتيجتك: RIA") — meaningless to an Arabic-speaking user. Replace it with the three letters as **styled chips carrying their Arabic type names in rank order** (strongest first), e.g. الواقعي، البحثي، الفني, reusing the existing `riasec.*` names. The card keeps its title ("اختر مسارك"), gains a short lead-in ("ميولك المهنية، مرتّبة من الأقوى:"), and keeps its **single** action → Results.
  *Explicitly rejected in discussion (do not add):* per-chip one-line summaries (Results owns explanation), a recommended-paths preview (Results owns the gold ranking), a dashboard retake link (retake stays on Results, next to the ranking it would replace — D-015).

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
  *Restraint is a requirement, not a style note.* The reference product's dashboard (screenshot on file) surrounds its summary with a journey stepper, KPI-percentage cards, a recommended-actions row and application/interview widgets. None of that is ported — most has no equivalent here and all of it violates §3. A journey stepper, if ever wanted, is its own discussion.

  **C. Before the assessment (`PRE_ASSESSMENT`)** — untouched.

  Approved mockups of all three states: the "Tamkeen Dashboard States" artifact (shared from Claude Code).

  **Acceptance:**
  - State A: three chips in profile rank order with Arabic names; the Latin code string appears nowhere on the dashboard; exactly one action (→ /results); no summaries, previews, or retake link; chips read as plain text in rank order to assistive tech.
  - State B: strip shows path name + Arabic RIASEC type + three counts that always sum to the path total; western digits via the shared number formatter (D-018); tiles are informational content, not fake buttons; wraps 2×2 at narrow widths, usable at 360px RTL; continue card unchanged and still the only action. The four link tiles below it (مساري، الدورات، شهاداتي، السيرة الذاتية — Phase 3 added the last two) are unchanged; the status strip must read as *status*, not as a fifth row of tiles — differentiate it (no hover affordance, no link styling).
  - State C unchanged. Dashboard unit tests and the API's dashboard integration tests updated.

  **Implementation notes (verified):**
  - All three branches are in `src/app/(portal)/page.tsx`, switched on the server-decided `dashboard.state` — keep rendering one branch per state; never assemble a screen from nullable fields.
  - **State A:** the code arrives as `dashboard.codeString` (e.g. "RIA", `DashboardView` in `packages/types/src/journey.ts`). Split its characters and map each through `riasec.<letter>.name` — all six names already exist in `messages/ar.json`. The current `dashboard.assessedBody` message interpolates `{code}`; rework it and remove what's no longer referenced or the catalog test fails. Chip fill: `--accent` (light gold) with navy text — the AA-safe achievement fill (6.01:1, D-025). Never raw gold behind body-size text; the contrast test enforces it.
  - **State B — API extension:** `DashboardView.path` carries only `{id, name, completedCount, totalCount, nextCourse}`. Add `riasecLetter` and `inProgressCount` (remaining = total − completed − inProgress, client-side) to the server's dashboard view builder in `apps/api` — one request, server decides, same pattern as the state field. Do NOT have the page call the my-path endpoint as a second request. The letter is already in the DB (`paths.riasec_letter`); `MyPathView` proves the counts are derivable server-side from per-course `status` (`UserPathCourseStatus`).
  - The RIASEC Arabic name for the path tile comes from the same `riasec.<letter>.name` messages as the chips — one lookup helper serves both states.
  - `src/test/pages/dashboard.test.tsx` asserts State A's current copy and will need State B's new payload fields in its fixtures — the type error is the reminder. Rebuild `packages/types` (`npm run build:types`) before web/api typechecks pick up the change.

---

> **Epic label: `profile`** — §4.12's profile/settings surface. progress.md deferred all of this to "Phase 5/6"; these tickets pull it forward deliberately (record that in decisions.md with the first PR). Shared rules: extend the existing single-card Tamkeen design (no reference-repo porting); every mutation is audited (§2), rate-limited like the other auth endpoints, and validated on both client and server; employee ID is identity and is **never** user-editable. No new email notification types may be added without amending the locked notifications rule (§2) — flag, don't improvise.

## TAM-109 — Profile: show employee ID + department, edit name + department

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

## TAM-110 — Profile: change password

- **Labels:** `profile`, `frontend`, `api`, `security`
- **Priority:** High
- **Pre-requisite:** TAM-109 (page sections + `me` module)
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
  - The verification email is a *reuse* of the locked "email verification" notification type, not a new type.

## TAM-112 — Sign-out in the sidebar footer

- **Labels:** `profile`, `frontend`
- **Priority:** Low
- **Pre-requisite:** none (independent; small)
- **Description:**
  Sign-out lives only on the profile page because it needed a home. Add a sidebar footer showing the user's name with a quiet "تسجيل الخروج" action, reachable from every portal page; the profile page keeps its own sign-out as a secondary action at the bottom ("both" per discussion). It is a footer, not a seventh nav item — the six-item steady-state nav is untouched.
  **Acceptance:** footer present on every `chrome="nav"` page, keyboard-reachable, not announced inside the primary-navigation landmark; behaviour identical to the profile button (logout call, then `/login`, navigating even if the request fails); e2e sign-out passes from a non-profile page.
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
  3. **Other paths collapsed, not hidden.** "مسارات أخرى" sits behind a native `<details>` toggle labelled "عرض المسارات الأخرى (6)" with the live count; expanded, they render as the same compact cards, fully selectable. This amends §4.4's "shown normally below" → "available one click below"; §3A's *recommendation, not restriction* is preserved. Record in decisions.md.
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
  - The "مسارك" marker must not be gold: gold means *recommended* (§3), and a chosen-but-not-recommended path would otherwise look recommended after the fact. Navy/secondary styling.

---

> **Epic label: `dga-alignment`** — adopt the DGA's national design system, **Platforms Code (كود المنصات)**, as the visual foundation of the product. Decided 2026-08-23: **full adoption including the palette**, applied to the **landing page and auth screens first**, the signed-in portal in a follow-up epic. **Source of truth: the official site `design.dga.gov.sa` and the official Figma "Components Library – Platforms Code"** — the community shadcn registry (`dga-registry.vercel.app`, 24 RTL components, unofficial) may be consulted as an accelerator but never as the authority.
> Why: this is a Ministry of Interior platform; the national design system is what the ministry and its users will recognize, and the landing page rebuilt from the reference repo (PR #5) reads as a generic template rather than a government product.
> **Ministry questions (blockers, add to progress.md):** (1) confirm whether Platforms Code compliance is *mandatory* for this platform or adopted by choice — it changes how much deviation is allowed; (2) who on the team has access to the official Figma library; (3) the ministry's own emblem/seal is still missing (D-051) and the landing/auth designs need it.
> **Consequence the whole team must know:** the palette lives in `apps/web/src/app/globals.css` as semantic tokens every shadcn component reads. Swapping it recolors the **entire app** — portal included — in one change. That is accepted; what is staged per surface is component/pattern alignment, not color.

## TAM-115 — Platforms Code foundations: tokens, typography scale, contrast audit, spec amendments

- **Labels:** `dga-alignment`, `design-system`, `frontend`, `spec-change`
- **Priority:** High (blocks TAM-116 and the re-based auth epic)
- **Pre-requisite:** someone with the official Figma/site extracts the foundations (this could not be fetched from the site, which is a JS app). Deliver them as a short written token sheet attached to this ticket *before* implementation starts.
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

## TAM-117 — Portal alignment to Platforms Code (follow-up epic stub)

- **Labels:** `dga-alignment`, `frontend`
- **Priority:** Low (placeholder — to be broken down after TAM-115/116 land)
- **Pre-requisite:** TAM-115, TAM-116, and the auth epic re-based on Platforms Code
- **Description:**
  Once the tokens are in and the public surfaces prove the direction, align the signed-in portal's **components and patterns** (sidebar/navigation, cards, forms, tables, empty/loading/error states, the recommended-path treatment, the status strip) to Platforms Code equivalents — colors will already have changed via TAM-115. Break this into per-surface tickets at that point; the currently written tickets (TAM-106–114) remain valid in behaviour and should be implemented against the new tokens, not blocked on this stub.
