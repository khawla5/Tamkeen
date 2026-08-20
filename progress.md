# progress.md — Running Implementation Log

> **Read this right after `CLAUDE.md` at the start of every session.** It tells you the last thing implemented so you can continue from there.
> **Update this file at the end of every session** (every meaningful output): what was done, what's next, blockers. Newest entry on top.

---

## Current status
- **Current phase:** Phase 3 — certificates + CV — **COMPLETE, user approved the test, PR opened and awaiting human review.**
- **Last completed task:** The **Phase 3 browser end-to-end pass** — certificate to gallery to download to public verification, and the CV builder through to a real English PDF export.
- **Next task:** **Phase 4 — the entity / reviewer portal** (full spec in CLAUDE.md §4B; authoring model in §4A), once the Phase 3 PR is merged.
- **Active branch:** `phase-3-certificates-cv` (13 commits), off `phase-3-arabic-pdf-spike`, off `origin/main` @ `dcb8aad`. **PR opened, not merged** (D-008).
- **Phase 2 is merged** (PR #3, `origin/main` @ `dcb8aad`).
- **Test totals:** 455 unit (api + web + types, 18 files) · 137 API integration against real PostgreSQL · 19 browser e2e in Chromium — **611 automated**, plus two real-Chromium verification scripts. Typecheck, lint and format clean.
- **Open blockers / questions for the human:**
  1. **⚠ THE MINISTRY LOGO AND SEAL ARE STILL MISSING.** Certificates ship with a neutral placeholder mark and an empty signature block (name + title). The slot is sized and positioned, so dropping in the real artwork is not a layout change — but **no certificate should reach a real employee until this is supplied** (D-051).
  2. **⚠ MINISTRY APPROVAL OF CUSTOM MOODLE PLUGINS IS STILL UNCONFIRMED.** Unchanged from Phase 2 and still the longest-lead dependency: seamless login uses `local_tamkeensso`, and if the ministry refuses custom PHP the fallback is the OAuth2-IdP route (D-044).
  3. **Production Moodle is 4.5 LTS, development is 5.2.2** (D-039). The seamless-login mechanism must still be re-verified on a real 4.5.
  4. **`CERT_STORAGE_DIR` must be set to an ABSOLUTE path in every deployment** (D-052). It defaults to a relative path, which resolves against the process's working directory — the browser suite caught downloads failing because the API and the tests disagreed about where the bytes were. For credentials this is not a detail.
  5. **`npm audit` reports the same 3 high advisories** for `deepmerge-ts` via `prisma` → `@prisma/config` — accepted and deferred (D-043), owned by the Phase 6 dependency review. Puppeteer and qrcode added none.
  6. **GitHub CLI is still not installed on the dev machine**, so PRs are opened from the compare URL rather than the terminal.
  7. **Ministry values still placeholders** (needed before Phase 7): the real allowed email domain (currently `ministry.gov.example`) and the real employee-ID format.

---

## Deferred / owed (carried into later phases)
- **The ministry logo, seal and signatory are not on the certificate.** A placeholder mark and an empty signature block hold their positions (D-051). **Phase 6/7** must drop in the real artwork before anything is issued to a real employee.
- **`CERT_STORAGE_DIR` is relative by default and must be absolute in deployment** (D-052). **Phase 7** owns setting it, backing that directory up, and deciding on object storage.
- **Jest cannot exercise the real PDF renderer.** Puppeteer 25 is ESM-only and Jest's CommonJS runtime cannot load it (D-055), so integration tests stub the renderer and assert the HTML contract. Real rendering is covered by the spike scripts and the browser e2e. **Phase 6** may revisit if Jest gains usable ESM support.
- **The certificate browser e2e seeds its certificate rather than earning it.** The mock LMS cannot be told to report a pass over HTTP, and shipping a test-only endpoint that manufactures completions into a government system is the wrong trade. Issuance itself is covered by unit tests and `spike/pdf/verify-issuance.ts`. **Phase 7's acceptance test** against a real Moodle closes this properly.
- **Certificates are not tagged/accessible PDFs.** Chromium emits untagged output, so Arabic extracts in visual order from naive extractors (the codepoints are correct and the CV's English body extracts perfectly). If the ministry wants PDF/UA, that is a **Phase 6** item.
- **The CV ships one template and no gallery**, per §4.11. A fully-localised all-Arabic CV remains possible later (D-050); the section model does not preclude it.
- **Profile is read-only.** §4.12 also lists change-password, email re-verification and a language switch. None is a Phase 1 deliverable; the page exists because §4.2 puts Profile in the pre-assessment nav and that link must lead somewhere real. **Phase 5/6** owns the rest.
- **Certificates and CV are absent from the navigation** until **Phase 3** builds them (D-037). Deliberate: a nav item leading nowhere advertises what the product cannot do.
- **A confirmed path can exist without its LMS enrolments.** Enrolment is best-effort after the commitment is recorded and is audited on failure; **Phase 2's sync job** owns reconciliation (D-036).
- **My Path reads live LMS progress but never persists it.** Writing `completions` is **Phase 2's** job; two writers on those rows would be a race (D-036).
- **`courseUrl` points at the mock (`localhost:8080`) and does not resolve.** Expected until **Phase 2** stands up Moodle and the seamless handoff.
- **The optional `enrollments` table (§6) is still not built**, now deliberately: `user_path_courses.enrolledAt` answers the only question anything asks, and a table whose sole consumer is a hypothetical debugger is speculative schema (D-041).
- **The balance rule must survive Phase 5's assessment editor.** `isBalancedBank` fails CI if an edit unbalances the bank; **Phase 5** must either keep it balanced or move ranking to normalised percentages (D-032).
- **Rate limiting is in-process** — per-instance counters, so horizontal scaling multiplies the effective limit. **Phase 7** must swap in a shared store when deployment topology is decided. Per-account lockout is in the database and unaffected. (D-028)
- **`deepmerge-ts` carries 3 high advisories** through `prisma` → `@prisma/config`, accepted and deferred (D-043). **Phase 6** must re-check whether Prisma bumped the pin upstream; do not downgrade Prisma to silence it (D-026).
- **`postcss` / `sharp` are pinned via npm `overrides`** to clear 3 high CVEs while holding Next 15. Each Next upgrade must re-check the pins. **Phase 6** dependency review owns this, and should consider dropping the `sharp` pin by disabling `next/image` optimisation entirely. (D-022)
- **Narrow-viewport layout not visually verified.** The `md:` breakpoint logic exists; the browser resize did not take effect during the Checkpoint C review, so no claim is made. **Phase 6** accessibility/responsive pass.
- **Employee IDs are format-validated, not verified.** Real verification needs a ministry roster or `admin-only` provisioning; the `REGISTRATION_MODE` switch exists for that decision. (D-017)
- **Completion sync processes every eligible learner in one pass**, with no batching or rotation. A silent cap would starve whoever fell outside it; **Phase 6** (sync reliability + load testing) owns making this scale. (D-042)
- **Seamless login is a custom Moodle plugin pending governance approval** (D-044). If the ministry refuses custom PHP, **Phase 6** must replace it with the OAuth2-IdP route, which is a larger piece of work — the decision should be chased early, not at hardening.
- **Entity scoping is not built.** RBAC is role-based only; which courses/learners an entity may see is data-scoped filtering and belongs with the entity model in **Phase 4**. (D-027)
- **`packages/types` holds only roles, locale and formatting.** RIASEC/path/certificate types arrive with the phases that define them.

---

## Decisions locked (see `decisions.md` for rationale)
- Assessment is **Holland (RIASEC)**: scoring tallies per dimension → ranked profile → top-three **Holland Code**.
- **Each path is tagged with one RIASEC letter**; a path is gold if its letter is in the user's top-three code, ranked by the user's letter order. (See CLAUDE.md §3A.)
- Arabic-first, RTL, from day one.
- One path per user; no switching once confirmed.
- 5–10 courses required to confirm a path.
- One Moodle course can belong to multiple paths; reuse completion for shared courses.
- Gold = recommendation highlight, not restriction.
- Certificates issued by our app (Arabic PDF), idempotent; pass threshold is a product setting.
- Email/password auth only, with email verification.
- MVP Moodle integration: scheduled sync job + token-mapped handoff; OAuth2/SSO is a hardening target.
- Color system fixed (see CLAUDE.md §3).
- **Stack locked (D-013):** Next.js 15 + Tailwind + shadcn/ui + next-intl (frontend); NestJS (backend); PostgreSQL + Prisma; Redis + BullMQ; headless-Chromium PDF; Moodle 4.5 LTS + REST + Catalyst RESTful plugin, isolated behind one NestJS module.
- **Engineering standards + Definition of Done (D-014):** testing (unit+integration+e2e, explicit RIASEC tests, mock shares real Moodle contract), mandatory loading/empty/error states, WCAG 2.1 AA, Conventional Commits, CI gates. This is what "the test" in the PR rule means.
- **Assessment retake pre-commitment only; course-edit protection (D-015).**
- **Certificate verification: unique ID + QR/public page (D-016).**
- **Restricted (ministry-scoped) registration, not open sign-up (D-017).**
- **Digits/dates: Western Arabic numerals default + single locale switch (D-018).**
- **Security/privacy baseline:** audit log, rate-limiting/lockout, PII minimization + retention (see CLAUDE.md §2).
- **Ties break on canonical R-I-A-S-E-C order (D-031)** — the ordering is total, so a Holland Code is reproducible.
- **The question bank is 30 Likert items, 0-4, balanced by construction and enforced in CI (D-032).**
- **Assessment retakes append; results are never overwritten (D-033).**
- **RIASEC ranking + the gold rule live in `packages/types`; the tally and the weights never leave the server (D-034).**
- **Schema constraints carry the product rules — unique `user_paths.user_id`, weights as an enum table, `Restrict` from responses to the bank (D-035).**
- **LMS provisioning is lazy at confirm; enrolment is best-effort after the commitment is recorded; live progress is read, never persisted (D-036).**
- **Authenticated pages sit behind one `PortalProvider`; Certificates/CV stay out of the nav until Phase 3 builds them (D-037).**
- **Course authoring uses Model 1 — entities author content in Moodle via handoff; the portals wrap only the product layer (D-046).**
- **Each course is single-language as authored (Arabic OR English); no per-course bilingual requirement (D-047).**
- **Admins edit assessment questions + weightings, NOT the core scoring algorithm (D-048).**
- **Assessment edits freeze existing results — versioning; past results never mutate (D-049).**
- **The CV is an ENGLISH document with Arabic proper nouns passed through as authored (D-050).** Supersedes the earlier "Arabic CV" wording; the Phase 3 PDF pipeline must prove English-body-with-inline-Arabic.
- **Entity & super-admin portals now fully specified in CLAUDE.md §4A/4B/4C; Phase 4/5 deliverables updated accordingly.**
- **The certificate face is austere: placeholder logo slot, both Hijri and Gregorian dates, no grade (D-051).**
- **Certificates are rendered once and stored immutably; the CV renders on demand (D-052).**
- **The verification id is public and stored unhashed; stored files are named by the row id (D-053).**
- **Path completion requires every chosen course PASSED, not merely completed — correcting a Phase 2 defect (D-054).**
- **Node 24 LTS replaces end-of-life Node 20; Puppeteer is imported lazily (D-055).**
- **One CV renderer serves both the live preview and the PDF; `en` joins LOCALES for the CV only (D-056).**
- **The CV stores only what the learner authored; certifications are re-read on every load (D-057).**
- **The in-app notification is a dot, cleared by opening the gallery (D-058).**

---

## Log (newest first)

### 2026-08-20 — Phase 3 complete; PR opened for review

Branch `phase-3-certificates-cv` (off `phase-3-arabic-pdf-spike`, off `origin/main`). **Not merged** (human review gate, D-008). PR body in `.github/PR_BODY_phase-3.md`; `gh` is still not installed, so the PR is opened from the compare URL.

**Test totals:** 455 unit · 137 API integration against real PostgreSQL · 19 browser e2e in Chromium — **611 automated**. Typecheck, lint and format clean.

**Thirteen commits**, one per checkpoint plus the spike and the docs.

**The phase rests on one claim: the Arabic PDF problem was solved before anything was built on it.** The spike proved letter shaping, lam-alef ligatures, bidi runs, an English document with inline Arabic, and a QR decodable at 72 dpi — then every later checkpoint reused that same pipeline. Nothing about Arabic rendering was discovered late.

**What was built, in order:**

```
spike        four sample PDFs; QR decoded back out at 72/144/288 dpi
course cert  issued at Phase 2's onCoursePassed seam, idempotent three ways
path cert    new onPathCompleted seam — and a Phase 2 defect corrected
verify       the one public route in the product; four fields, nothing more
gallery      §4.10, plus the nav items D-037 had withheld
notifications a dot, and the emails folded in rather than doubled
cv           model + pre-fill, builder + live preview, English PDF export
e2e          the whole thing through a real browser
```

**A defect found and fixed (D-054).** Phase 2 finished a path when every chosen course read `COMPLETED` — a status that comes from the LMS's completion signal alone. A learner could finish all five courses and pass none, and Phase 3 would have certified it. Both the path status and the certificate now gate on `completions.passed`. Proven against a real database: refused at 5/5 `COMPLETED` with one course at 45% against a threshold of 70, then issued once it passed.

**Two things the work forced that were not in scope.** Node 20 is past end of life and was still pinned; Puppeteer's ESM-only packaging forced the question and it was overdue anyway (D-055). And `CERT_STORAGE_DIR` being relative meant the API and the browser suite resolved credential storage to different directories — caught by a 500 on download, and now flagged for deployment (D-052).

**Two corrections worth recording.** A reported bidi defect in the CV's career line was not real — measured glyph positions put the full stop correctly to the right of the Arabic run, and the speculative `&lrm;` fix was reverted rather than left carrying a false rationale. And the API's copy of the Arabic RIASEC names had `C` as "التقليدي" against the catalogue's "التنظيمي"; the drift guard that now compares the two caught it on its first run.

### [DATE] — Phase 4/5 portals specified + language decisions (planning, no code)
- CLAUDE.md gained §4A (Model 1 authoring + cross-portal linking rules), §4B (Entity/reviewer portal full page spec), §4C (Super-admin portal full page spec). Phase 4 + Phase 5 in §7 rewritten to reference them and to fold in the deferred items they own (D-027 entity scoping, D-035 objectives/prerequisites editable, deferred Profile items).
- Locked D-046 (Model 1 authoring), D-047 (single-language courses), D-048 (admins edit questions/weightings not the algorithm), D-049 (assessment-edit result freezing), D-050 (English CV with pass-through Arabic).
- §4.11 CV spec changed from Arabic-first to English-document. NOTE for Phase 3: the CV is English with inline Arabic proper nouns — the PDF spike must cover that case, not only pure Arabic.
- **Reminder:** Phase 2's PR is approved but still NOT merged (gh not installed; open/merge it on GitHub). Phase 3 must branch off a main that includes Phase 2.

### 2026-08-19 — Phase 2 complete; PR opened for review

Branches `phase-2-moodle-spike` and `phase-2-moodle-integration` pushed. **Not merged** (human review gate, D-008). PR body in `.github/PR_BODY_phase-2.md`; `gh` is still not installed on this machine, so the PR is opened from the compare URL.

**Test totals:** 352 API unit · 96 API integration against real PostgreSQL · 142 web unit · 14 browser e2e in Chromium — **604 automated**, plus the real-Moodle pass. Typecheck, lint and format clean.

**Nine commits**, one per checkpoint plus the spike, the dependency decision and the final pass.

**The claim the phase rests on:** the mock→real swap changed only the implementation. No caller of `LmsPort` was touched in any checkpoint — the port, the executable contract and the mock were built in Phase 0 for exactly this, and they held.



### 2026-08-19 — Phase 2 test pass: the whole loop, against a real Moodle

`MOODLE_MODE=real`, an isolated database, the **BullMQ scheduler polling every minute**, and a human taking a real quiz. Every effect landed in Moodle 5.2.2.

**The journey, over HTTP only** — so nothing it proves can be a rule living solely in a React component:

```
health      {"moodleMode":"real","lms":"up","lmsSiteName":"Dockerized_Moodle"}
register    → verified with a token read out of the delivered mail
assessment  → Holland Code: RIA
path        → 7 courses offered (the hidden one correctly excluded)
confirm     → 5 courses committed
```

**Enrolment, asked of Moodle rather than trusted from our own status field:** all five present on user 7.

**The loop closed on its own.** The scheduler logged `1 newly passed` at 15:26:48 and `0 newly passed` at 15:27:48 — the transition fired exactly once, with no manual trigger.

```
PASS  the app records the course as completed        status = COMPLETED
PASS  the grade came back from Moodle                gradePercent = 100
PASS  passed against the product threshold           passed=true at threshold 70
PASS  exactly one course-passed email was sent       1 email(s)
PASS  a second sync changes nothing                  COMPLETED/100 -> COMPLETED/100
PASS  and does NOT send the email again              1 email(s) after a second sync
```

**The `completions` table, read directly:** course 2 is `completed=t, grade=100, passed=t, pass_threshold_used=70` with a real `completed_at`; the four unattempted courses carry `grade_percent = NULL`, **not 0** — the distinction that would otherwise read as a failed attempt. **5 rows, 5 distinct `(user, moodle_course_id)` keys** after a dozen sync cycles.

**Setup the pass needed:** the dev Moodle had one usable course and the 5-10 rule needs five, so six test courses were created on it through Moodle's own PHP API. `scripts/real-pass-setup.ts` seeds the assessment, mirrors the live catalogue and builds one path over it — the last part is test scaffolding, since the seeded twelve paths are built on mock course ids. **Phase 7 owns real catalogue and path data.**

**Two things learned while doing it:**
- `tsx` cannot boot the Nest container — esbuild does not emit `emitDecoratorMetadata`, which is exactly what Nest reads to resolve constructor parameters, and the failure presents as a misleading "dependency at index [0] is undefined". Scripts that need DI must run compiled.
- The 60-second handoff TTL is right for production and impractical for a human step; the pass ran at the 300-second cap. The verify script now reads the lifetime out of the token rather than printing a constant that would quietly become wrong.

**Phase 2's "done when" is met:** a real user, from the app, entered a real Moodle course, took its quiz, and the app reflected completion and pass/fail automatically and idempotently. The mock→real swap changed only the implementation — no caller of `LmsPort` was touched in any checkpoint.

**Awaiting the user's approval of this test before opening the PR** (D-008).



### 2026-08-19 — Phase 2 checkpoint 6: the course player

§4.8's page, and it is now the **only** route into a course.

**The handoff is minted per click, never rendered.** `POST /api/courses/:id/launch` returns a fresh signed URL; the page contains no credential until the learner asks for one. A component test and a browser test both assert the markup does not contain it — the point of minting on click is defeated the moment a URL sits in the DOM waiting.

**`courseUrl` is gone from `CourseDetail` and `MyPathCourseView` (D-045).** Both screens previously linked straight at the Moodle deep link, which **carries no session** — a learner following it would land on a Moodle page that did not know who they were. Now that the handoff works, leaving the unauthenticated link in the API contract would leave the wrong thing equally available.

**Enrolment now also happens on demand at launch.** A learner who confirmed while the LMS was down had a committed path with no enrolments (D-036) and would have hit a Moodle access-denied page. `ensureEnrolledForLaunch` enrols right then, idempotently — "wait a sync interval and hope" becomes "it works".

**The mock got stricter, again.** Its launch URL was stable, and an integration test asserting freshness failed against it. A handoff is single-use, so a stable URL hands back an already-spent token; the mock now varies per call and the **contract** requires it. This is the second time a too-permissive mock would have let a real bug through (D-036 was the first).

**Two of my own test mistakes, both instructive:** a component test rendered twice in one case without unmounting, so the "absent" assertion found the first render's link; and an integration test asserted a property the mock did not have. Both are fixed at the cause rather than by loosening the assertion.

**Totals:** 352 API unit, 96 API integration, 142 web unit — all green. Typecheck, lint and format clean across both apps. The browser e2e now walks My Path → player → back, and was run against built apps.

**Next:** the full Phase 2 test pass — the whole loop against the real Moodle end to end — then the PR.



### 2026-08-19 — Phase 2 checkpoint 5: seamless login, proven end to end

`local_tamkeensso` (D-044) plus app-side token minting. **Verified against the live Moodle, including the refusals** — a handoff that only proves it lets people in has demonstrated nothing about who it keeps out:

| check | result |
|---|---|
| fresh token | `303 → /course/view.php?id=2`, and the course page renders the learner's Arabic name — a real session, no login form |
| replayed token | refused ("already been used") |
| tampered payload (user id edited to 1) | refused ("not valid") |
| expired but validly signed | refused ("expired") |

Repeatable as `npx tsx spike/verify-sso.ts`.

**Cross-language agreement is asserted, not assumed.** The plugin verifies in PHP what we mint in TypeScript, so a unit test pins the wire format exactly — unpadded base64url, HMAC-SHA256 over the *encoded* payload string, camelCase claims — and a live check ran a TS-minted token through the plugin's PHP verification inside the container. Two implementations read side by side would have drifted.

**Why core Moodle could not do this** (established, not assumed): every core mechanism mints a session for the **web-service token's own user**, and our token is `tamkeen-integration`, not the learner. `tool_mobile_get_autologin_key` fails on that plus three other counts.

**A version difference worth knowing:** Moodle 5.x moved the web-facing tree into `public/`, so the plugin installs to `public/local/tamkeensso` on 5.x but `local/tamkeensso` on the 4.5 production target. Getting it wrong means the plugin silently never loads. Both paths are in `moodle-plugin/README.md`.

**Installed on the dev Moodle** to verify rather than shipping untested PHP — a throwaway instance the user said can be wiped.

**Totals:** 351 API unit tests (was 331), 90 integration tests, all green; typecheck, lint, format clean.

**Owed:** re-verification on a real **4.5** (D-039), and the governance answer on custom plugins (D-044) — the longest-lead item in the project.

**Next checkpoint:** the course player (§4.8) — now unblocked — then the full Phase 2 test pass.



### 2026-08-19 — Phase 2 checkpoint 4: completion sync

The loop now closes in the product, not just in a spike. `getCourseProgress`/`listProgressForUser` are real, `completions` exists, and a scheduled job drives catalogue sync, enrolment reconciliation and completion sync in that order (D-042).

**Verified against the live Moodle**, reading the learner who actually took the quiz: `{"completed":true,"completedAt":"2026-08-18T13:57:59.000Z","gradePercent":100}` → our verdict `passed: true` at `PASS_THRESHOLD=70`. A course they are not enrolled in returns `null`; an unknown learner returns `[]`; three consecutive reads are identical.

**One constraint carries three rules.** `completions` unique on `(user_id, moodle_course_id)`: polling cannot duplicate a row, a shared course reuses the one completion instead of being re-taken (D-003), and Phase 3 gets a stable idempotency key. Keyed on the *LMS* course id so a completion survives our catalogue row being retired.

**The email fires only on the transition into passing** — the single irreversible act in a job that re-reads the same data forever. Tested by running the sync three times and asserting one email.

**A hazard the spike had already shown us** is now guarded: a Moodle course with no completion criteria reports `completed:false` forever, so nobody on it can ever pass however well they score, and the symptom is "certificates never arrive" with nothing in any log. `isGradedButNotComplete` detects that exact shape and names the course.

**My Path's live-progress overlay is gone, closing D-036.** Phase 1 read the LMS on every render because nothing persisted progress; this job is the writer that was missing. It also removes an N+1 LMS call from a page load — the page no longer needs Moodle to be up to render.

**Totals:** 331 API unit tests (was 285), 90 integration tests against real PostgreSQL, all green; typecheck, lint, format clean. One migration (`phase_2_completions`). Callers of `LmsPort` still unchanged.

**A security finding, not introduced here:** `npm audit` now reports **3 high** advisories for `deepmerge-ts`, reached through `prisma` → `@prisma/config`. It is not from BullMQ (verified by tracing the tree) — it is a newly published advisory against a dependency we already had. An npm `overrides` pin in the D-022 style **does not take effect** here, and npm's own fix downgrades Prisma to 6.x, breaking D-026. Exposure is low: it is a CLI/config-time dependency reached when loading a Prisma config file, not in the request path. **Flagged for a decision rather than silently absorbed** — see the blocker list above.

**Next checkpoint:** the seamless-login spike, before any course-player UI is built (D-039).



### 2026-08-18 — Phase 2 checkpoint 3: enrolment

`enrol`/`isEnrolled` are real, and enrolment now survives a Moodle that misbehaves (D-041).

**Verified against the live Moodle** — `spike/verify-enrol.ts`: provision → `isEnrolled` false → `enrol` → `isEnrolled` true → `enrol` again, no error, and false for a course the learner does not hold.

**Two defects that only exist against a real LMS.** `enrol` now **verifies before believing its own error**, because Moodle throws *after* committing the enrolment — the spike proved it, and the same reasoning covers a timeout, where the request may well have landed. And each course is enrolled **independently**: the old single `try` around the whole 5–10 course loop would abandon every course after a refused one and audit the batch as failed, leaving a learner half-enrolled in a path they cannot switch out of.

**`retryPendingEnrolments` closes the loop D-036 left open** — best-effort enrolment is only defensible if something reconciles the leftovers. Bounded per run, safe any time, attributed to no IP address because it is a background job rather than a person.

**A new unit suite for enrolment resilience**, which did not exist: Phase 1 tested enrolment only through the journey integration suite, where the mock never fails, so none of this was reachable. Nine cases covering partial failure, provisioning failure, double-enrol prevention and multi-path reconciliation.

**Also fixed while here:** the reconciler counted enrolments by subtracting a global pending tally, which reports zero on a run that enrolled plenty whenever more rows are outstanding than the batch limit. It now sums what each attempt actually did.

**Not built, deliberately:** the optional `enrollments` table (§6). `user_path_courses.enrolledAt` answers the only question anything asks; a table whose sole consumer is a hypothetical future debugger is speculative schema. Recorded in D-041.

**Next checkpoint:** completion sync — the `completions` table keyed on `(user, moodle_course_id)`, the pass threshold, and the BullMQ scheduler that will also drive catalogue sync and enrolment reconciliation.



### 2026-08-18 — Phase 2 checkpoint 2: catalogue sync

`listCourses`/`getCourse` are real, and `CatalogSyncService` mirrors the LMS catalogue into `courses`.

**Verified against the live Moodle**, not just mocks — `spike/verify-catalog.ts` reads the real catalogue through the adapter: two courses returned, **the site course (id 1) correctly discarded**, the hidden course present with `visible: false` so sync can see it, `getCourse(9999)` → `null`, and `durationMinutes: null` exactly as D-039 predicted.

**Three destructive defaults avoided, recorded as D-040.** A vanished course is never deleted and is only retired if **no learner holds it** — `RETIRED` is invisible even to someone who already selected it, so retiring an in-use course would breach D-015. An empty catalogue is treated as a fault and writes nothing, rather than withdrawing everything in one pass. And sync writes only what Moodle owns: letting the LMS's `null` overwrite an authored `durationMinutes` would have erased every duration on the first run *without erroring*, since the column is nullable.

**Two stale tests updated honestly rather than deleted.** `moodle.module.spec` asserted the real adapter throws `NotImplementedException`; it now reaches an unreachable host and reports the LMS down. The property under test — an unusable LMS must never present as an empty catalogue — is unchanged, and the test still asserts it.

The seed runner now shares `fieldsForPublishedCourse` with the sync, so a seeded and a synced database cannot describe the same course differently.

**Totals:** 268 API unit tests (was 234) and **90 integration tests against real PostgreSQL**, all green; typecheck, lint and format clean. Callers still unchanged.

**Next checkpoint:** enrolment — including the verify-before-believing-the-error rule the spike proved necessary (D-038).



### 2026-08-18 — Phase 2 checkpoint 1: real Moodle client + user provisioning

Branch `phase-2-moodle-integration`, off `phase-2-moodle-spike` so the proof stays in the history rather than being orphaned.

**Built.** `MoodleWsClient` — the only thing that speaks HTTP to Moodle: PHP nested form encoding, timeouts, and the protocol's dangerous quirk, that **core REST answers HTTP 200 for errors** with the failure in the body. It handles real status codes too, so installing the Catalyst plugin later is not a behavioural change. `moodle-identity.ts` holds the derived-username scheme D-038 rests on. `MoodleHttpService` now really implements `checkHealth`, `provisionUser` and `findUserByEmail`; catalogue, enrolment and progress still refuse, by checkpoint.

**Verified three ways**, deliberately: 86 unit tests over the module with the HTTP layer mocked (our logic); the spike's raw REST calls (Moodle's behaviour); and `spike/verify-adapter.ts` driving the **real adapter against the live Moodle** — `checkHealth` → `5.2.2`, `provisionUser` twice → same id, uppercased email → same id, no duplicate. The gap between "our logic is right" and "it works against a real server" is where integrations usually fail, so it is closed explicitly.

**A test changed the code.** Asserting that no failure mode puts the token into a thrown error found that `MoodleWsError` was carrying Moodle's raw `message`, which a debug response can echo the request into. It now carries only the errorcode.

**Totals:** 234 API unit tests (was 189), all green; typecheck + lint clean. `LmsOperationError` added to `lms.types` to separate "retry this" from "a human must look" — the mock is unaffected, so the swap stays intact.

**Decisions:** D-039 records the version split (4.5 LTS production / 5.2 dev, adapter version-agnostic, seamless login to be re-verified on 4.5), `durationMinutes` as our product metadata, handoff-plus-early-login-spike for v1, and the client shape choices.

**Next checkpoint:** catalogue sync — `core_course_get_courses_by_field` per D-038, skipping the site course, idempotent and re-runnable.

### 2026-08-18 — Phase 2 spike: the Moodle loop is proven

Branch `phase-2-moodle-spike` off `origin/main` @ `f25b644`. One file, `spike/moodle-spike.mjs` — plain Node ESM, no build step, talks to Moodle's REST endpoint **directly** rather than through our adapter, so what it proves is a property of Moodle and not of code we wrote to satisfy ourselves.

**The loop closes.** Against real Moodle **5.2.2** at `localhost:8080`: provision user → enrol in course 2 → learner took the quiz in Moodle → we detect `completed: true`, `completedAt: 2026-08-18T13:57:59Z`, `gradePercent: 100` ⇒ **PASS** at `PASS_THRESHOLD=70`. Three consecutive reads returned byte-identical results.

**Five findings became D-038**, each a defect that would otherwise have shipped: email lookup silently returns empty under least privilege (→ key on a username we derive); `enrol` throws *after* committing (→ verify before believing the error); `core_course_get_courses` omits `visible` (→ use `..._by_field`); only a course-total grade item is returned (→ always evaluate the course total); `completionstatus.timecompleted` does not exist (→ derive from the criteria).

**Four Moodle-side gaps the spike surfaced**, all fixed by the human: `moodle/role:assign` plus the Allow-role-assignments matrix row (enrolment returned `wsusercannotassign` for *every* role id until both were set); the manual-enrolment welcome message (no mail transport in the container); and the test course, which turned out to contain no quiz at all — `core_course_get_contents` showed only the default Announcements forum, which explained both `nocriteriaset` and the missing grade item.

**Not yet built:** anything in `apps/`. The spike is deliberately disposable and no application code has changed. `MoodleHttpService` still throws `NotImplementedException`; `MOODLE_MODE` is still `mock`; no `completions` table, no BullMQ.

**Next:** on approval, branch `phase-2-moodle-integration` and build the real adapter against `describeLmsContract`, in the order: client + provisioning → catalogue sync → enrolment → completion sync → seamless login + player.

### 2026-08-18 — CI failed on the Phase 1 PR; fixed

**Cause:** the workflow applied migrations but **never seeded**. Phase 0's tests only needed authentication, so an empty database was a valid starting state; from Phase 1 the tests need real content — the assessment bank, the paths, the catalogue — and the journey suite collapsed without it. A gap in the workflow, not in the code under test.

**Fixed:**
- `ci.yml` gained a **Seed reference data** step after `db:deploy` (the seed is idempotent, so re-running is safe).
- `journey.e2e-spec.ts` now **fails once, clearly**, on an unseeded database instead of producing forty unrelated-looking assertion failures whose real cause has to be inferred.
- Fixed a genuine e2e flake found while verifying: the skip-link test tabbed immediately after the redirect to `/`, but `PortalProvider` renders only a loading state until the session and dashboard load — so there was no shell and no skip link yet. `signIn` now waits for the navigation landmark, which makes every consumer of the helper safe rather than patching one test.

**Verified** by reproducing against a fresh `tamkeen_ci` database and then running the workflow's exact sequence end to end on it: migrate → seed → format → lint → typecheck → unit → integration → build → Playwright. **459 tests pass from an empty database.**

### 2026-08-18 — Phase 1 complete; PR opened for review

Branch `phase-1-assessment-core`, 5 commits on `main` @ b478327. **Not merged.**

**Test totals:** 355 unit (38 `packages/types`, 189 api, 128 web) · 90 API integration against real PostgreSQL · 14 browser e2e in Chromium. **459 total.** format / lint / typecheck / build clean.

**1.1 Scoring engine + shared contracts** — ranking, tie-breaking, code derivation and the gold sort live in `packages/types` so web and api cannot disagree about what "gold" means (D-034); the **tally** stays server-side because it needs the weights. Ties break on canonical R-I-A-S-E-C (D-031) — without a total order the same answers could yield a different recommendation on a different day. 55 tests covering ties, a clear top-three, and gold matching + ranking, as §2B demands.

**1.2 Question bank** — 30 Arabic Likert items, five per dimension, weights 0-4, **balanced by construction** and asserted (D-032): ranking compares raw scores across dimensions, so an unbalanced bank would produce a code reflecting its own shape rather than the user's interests. Seeded data, not components, with stable keys so wording revisions need no migration. Items are interleaved so no two consecutive statements share a dimension.

**1.3 Schema, migration, seed** — one migration adding assessment/paths/courses tables. Constraints carry the rules (D-035): `user_paths.user_id` is unique so single-path survives concurrent confirms; option weights are a table with an enum column, because a mistyped letter in JSON fails *silently* into a wrong Holland Code; responses reference the bank with `Restrict` so Phase 5 edits cannot rewrite history. Mock catalogue grew 12 → 48 courses (twelve could not support twelve paths each offering a genuine 5-10 choice); 12 paths, two per letter, so the within-letter ordering is actually exercised. Seed is idempotent — verified by three consecutive runs leaving row counts identical. The API tsconfig now typechecks `prisma/`.

**1.4 API** — assessment, paths, courses, path commitment, dashboard. Rules live in services, never controllers. Confirm re-counts **inside** the transaction and guards on `confirmedAt IS NULL` in the `UPDATE … WHERE`, so two concurrent confirms cannot both succeed. Gold ordering calls the shared function rather than an `ORDER BY`. `resolveCourseAction` is pure and returns exactly one value, so §3's "never all three" is enforced by the response shape; an exhaustive sweep over all 48 state combinations asserts it. **No view type carries a weighting** — an integration test greps the whole `/api/assessment` response for `weight`, `dimension`, `points`, `riasec`, and the e2e suite has to read weights out of the database to produce a chosen code.

**1.5 Web** — assessment flow, results with the gold ranking, path build with the live counter and the native-`<dialog>` commitment gate, catalogue + detail, My Path, the dashboard's three states, minimal profile. Authenticated pages sit under a `(portal)` route group; `PortalProvider` loads session + journey state once and owns the 401 redirect (D-037), because the nav depends on that state and a per-page copy would disagree with its own content.

**Three defects the verification pass found — each now has the test that would have caught it:**
- The `{}`→`null` normalisation also flattened an empty **array**, so an empty catalogue never reached its empty state and rendered a heading above nothing. Caught by the catalogue e2e.
- The mock LMS numbered users from a **per-process counter**, so after a restart it handed a new user an id an existing row already held and enrolment died on the `moodle_user_id` unique index. Ids now derive from the email, matching the invariant a real Moodle has; the contract suite asserts stability across instances (D-036).
- `PathCard` paired each value with a visually-hidden `<dt>`, making a screen reader announce *"دورة متاحة، 11 دورة متاحة"*.

**Three more found only by driving the built app in a browser:** the modal pinned to the top (Tailwind's preflight zeroes the `margin:auto` the UA stylesheet centres a `<dialog>` with); the progress track invisible at 0% (cream on white); course detail printing its title twice.

**Also:** error codes moved from `auth.errors` to a top-level `errors` catalogue — they come from one API vocabulary, and splitting them by feature means deciding where a shared code belongs.

**Honest gaps at hand-off:** profile is read-only; `courseUrl` does not resolve until Phase 2; a confirmed path can exist without its LMS enrolments until sync runs; narrow-viewport layout still unverified (carried from Phase 0, Phase 6 owns it); CI has run once.

**Next:** Phase 2 — the Moodle spike first, then the real adapter against `describeLmsContract`.

### 2026-08-17 — Phase 0 complete; PR opened for review

Branch `phase-0-foundations`, 7 commits on `main` @ 6442ed4. **Not merged.**

**Test totals:** 199 unit (12 `packages/types`, 113 api, 74 web) · 38 API integration against real PostgreSQL · 9 browser e2e in Chromium. format / lint / typecheck clean.

**0.1 Monorepo & tooling** — npm workspaces (D-020): `apps/api` NestJS 11, `apps/web` Next 15 + React 19, `packages/types`. Strict shared tsconfig, Prettier + per-workspace ESLint flat configs, `.gitattributes` for LF parity with CI. Zod-validated env at boot. `docker-compose` for PostgreSQL 16 / Redis 7 / Mailpit (D-021). npm `overrides` cleared 3 high CVEs while holding Next 15 (D-022). **Fixed:** `gitignore`/`env.example` had no leading dots, so the ignore file was inert and `.env` was unprotected.

**0.2 Arabic-first RTL / i18n** — next-intl without locale routing (D-024); `lang="ar" dir="rtl"` fixed; all copy in `messages/ar.json` including the document title. The D-018 switch point lives in `packages/types` and is shared by web and api so screen and PDF cannot disagree; next-intl receives the extended tag (`ar-u-nu-latn-ca-gregory`) so ICU-embedded numbers honour it too. Self-hosted IBM Plex Sans Arabic (D-023) — removes a build-time network dependency *and* a third-party disclosure of who uses an internal system. A catalog test fails the build on empty strings, unbalanced ICU braces, stray English, or hardcoded digits.

**0.3 Design tokens & UI shell** — the seven brand colours once in `globals.css` with a shadcn-compatible semantic layer. **Measured** contrast (D-025): gold `#A8863C` is 3.08–3.99:1 and **fails AA for body text on every background**, including as a fill with white *or* navy text; it is now restricted to borders/rings/icons/large text, with light gold + navy (6.01:1) as the AA-safe achievement fill. Two functional colours added outside the palette (danger/success) because mandatory error states need a signal colour and §3 has none. 24 contrast assertions, including negative tests documenting the restriction. `LoadingState`/`EmptyState`/`ErrorState` + a `DataView` that makes the happy path unreachable without handling all three; error outranks empty so a failed request is never reported as "nothing here yet".

**0.4 Database & migrations** — Prisma 7 with the pg driver adapter (D-026); foundation tables only (`users`, `auth_tokens`, `sessions`, `audit_log`, `notifications`), with a test asserting product tables stay absent. Token hashes only; timestamps not booleans; audit references ids only and survives actor deletion via `SetNull`; UUID keys. Seed has no known default password — production requires it explicitly or refuses to run — and is idempotent. RBAC is role-based and code-defined, with no permission table (D-027).

**0.5 Auth & security** — restricted registration (D-017) failing *closed* on an empty allow-list or bad pattern; email verification and reset via single-use hashed tokens; opaque Postgres sessions with immediate revocation (D-028); per-account lockout; double-submit CSRF; global **fail-closed** session guard so a controller added later is protected by omission rather than exposed by it; audit written from services, not controllers. Enumeration resistance end to end, including a dummy argon2 verify to equalise timing. Five Arabic RTL auth pages; a `Field` component makes label/`aria-invalid`/`aria-describedby` structural.
  **Security defect found and fixed (D-029):** `@nestjs/config`'s `ConfigService` reads `process.env` in preference to the validated object, so `ALLOWED_EMAIL_DOMAINS` arrived as a *string* and the domain check became a **substring match** — `attacker@ministry.gov` would have passed a gate set to `ministry.gov.example`. The existing domain test passed for the wrong reason (`gmail.com` fails a substring check too). Config now reads the validated object; tests assert the types and explicit prefix/substring rejection.

**0.6 LMS port (contract-first)** — one `LmsPort` behind the `LMS_PORT` token, in **our** vocabulary; a test asserts Moodle's native field names never reach a caller. The contract is an **executable suite** (`describeLmsContract`) asserting idempotent provision/enrol, `null` for unenrolled, **null grade not 0** for unattempted, copies not shared state, and no token in the course URL — Phase 2 runs the same suite against the real adapter. `LmsCourseProgress` has no `passed` field, asserted, because the threshold is a product setting (D-007). `MOODLE_MODE=real` boots and fails loudly rather than reporting an empty catalogue. Mock-only simulation helpers stay off the port. (D-030)

**0.7 Testing & CI** — Playwright against the built apps, real PostgreSQL and real SMTP; the verification token is read out of Mailpit because the database stores only its hash. Locators are by label and role, which **caught two real accessibility defects**: the required asterisk nested inside `<label>` made the accessible name `"كلمة المرور*"` (a spurious "star"; `aria-hidden` does not help), and `AuthCard` rendered its title twice as an h2 and an h1. Both fixed with regression tests. CI runs format → lint → typecheck → unit → API integration → build → browser e2e.

**Honest gaps at hand-off:** CI has never executed (this PR is its first run); narrow-viewport layout not visually verified; the ministry's real email domain and employee-ID format are still placeholders.

**Next:** Phase 1 — RIASEC content + scoring engine.

### [DATE] — Two open questions resolved (D-019)
- Auth: **email/password only, no AD/LDAP** (user confirmed). Updated CLAUDE.md §2/§5 and Phase 2; annotated D-004.
- Moodle: **latest 4.5.x LTS** (github.com/moodle/moodle newest `v4.5.x` tag; supported to Oct 2027; PHP ≥ 8.1 + sodium + max_input_vars ≥ 5000). Recorded as D-019.
- No open blockers remain for Phase 0 or Phase 2 auth. Application code still not started.
- **Next:** run the Phase 0 kickoff prompt.

### [DATE] — Deep audit: filled 14 gaps
- Attempted to read the repo `AbdullahDamati/tamkeen` — returns 404 (private or not yet created); could not inspect current contents. Treating these files as the repo foundation. If the agent needs the real repo state, it must be made accessible.
- Audited all four files as the build agent would; found and filled gaps:
  - **§2B added** — Engineering standards + Definition of Done; defines what "the test" means (D-014).
  - **Assessment retake** locked to pre-commitment; **course edit/unpublish protection** added (D-015).
  - **Certificate verification** (unique ID + QR/public page) added (D-016).
  - **Registration policy** locked to restricted/ministry-scoped (D-017).
  - **Digits/dates** default + single switch point (D-018).
  - Added product rules for **notifications**, **security/privacy baseline (audit log, rate-limiting, retention, PII handling)**.
  - Clarified the **shared-course reuse** wording so it's coherent under single-path (completion keyed on `(user, moodle_course_id)`, idempotent — no dead cross-path machinery).
  - Data model gained: `courses.status`, `completions` uniqueness, `certificates.verification_id`, `audit_log`, `notifications`, RBAC tables.
  - Phases 0–7 augmented to actually build all of the above (RBAC + audit + mock contract + rate-limiting + states/a11y in P0; retake in P1; idempotent sync + notifications in P2; verification + notification in P3; course-edit protection in P4; retention + CVE/Moodle-pin + backups/restore + Arabic Moodle theme in P6/P7).
- Still no application code yet.
- **Next:** Phase 0 foundations after human confirms the two open questions.

### [DATE] — Stack/architecture locked + README created
- Locked the tech stack and architecture as **D-013** in `decisions.md` (Next.js 15 / NestJS / PostgreSQL+Prisma / Redis+BullMQ / Chromium PDF / Moodle 4.5 LTS behind one anti-corruption module).
- Verified Moodle baseline via web research: 4.5 LTS supported to ~late 2027, single REST endpoint, Catalyst RESTful plugin for real HTTP status codes, CVE-2025-32044 (fixed 4.5.3) noted for hardening.
- Created **`README.md`** — system overview: what it does, RIASEC model, stack, architecture diagram, Moodle integration, data model, portals & pages, design system, phases, working agreement, getting started.
- Still no application code yet.
- **Next:** Phase 0 foundations after human confirms open questions (AD/LDAP? Moodle version to deploy?).

### [DATE] — Holland/RIASEC + comprehensive phases update
- Assessment defined as **Holland (RIASEC)**: added CLAUDE.md §3A (six dimensions, scoring → Holland Code, path tagging, gold recommendation rule).
- **Paths now carry `riasec_letter`**; recommendation = path letter ∈ user's top-three code, ranked by the user's letter order.
- Updated Assessment + Results page specs and the data model (`assessment_options` with RIASEC weighting; `assessment_results` stores all six scores + code; `paths.riasec_letter`).
- Rewrote phases into a **comprehensive 8-phase plan** (0–7) with goal / deliverables / "done when" per phase; split entity and super-admin portals; added a dedicated deployment+acceptance phase.
- Recorded decisions D-011 (RIASEC) and D-012 (comprehensive phase plan) in `decisions.md`.
- Still no application code yet.
- **Next:** Phase 0 foundations after human confirms stack + open questions above.

### [DATE] — Project initialization
- Created `CLAUDE.md` (rules + full context + page specs + phases), `progress.md` (this file), `decisions.md` (rationale).
- No application code yet.
- **Next:** Phase 0 foundations after human confirms stack + open questions above.

---

## Phase tracker
- [x] **Phase 0 — Foundations** (skeleton, RTL/i18n, color tokens, auth+email verification, user model, mocked Moodle service, CI) — **merged** (PR #1, `main` @ b478327)
- [x] **Phase 1 — Assessment (RIASEC) + path core** (RIASEC questions+scoring→Holland Code, gold ranked results, letter-tagged paths, catalog+detail from mock, 5–10 build + single-path commit, dashboard's 3 states, My Path) — **PR open, not merged**
- [ ] **Phase 2 — Moodle integration** (spike first; web services, provisioning, catalog sync, enrollment, scheduled completion sync + pass threshold + shared-course reuse, auth/SSO, course player)
- [ ] **Phase 3 — Certificates + CV** (idempotent course/path certs, Arabic PDF solved, gallery, CV builder + PDF export)
- [ ] **Phase 4 — Entity / reviewer portal** (entity roles, course publishing + path/RIASEC tagging + ordering, learner review dashboards, scoping)
- [ ] **Phase 5 — Super-admin portal** (user/path/assessment/settings/certificate-template management, global + integration-health dashboards)
- [ ] **Phase 6 — Hardening** (Arabic QA, RTL PDF polish, security review, sync reliability + load, a11y, states)
- [ ] **Phase 7 — Deployment, acceptance & launch** (deploy app+Moodle, seed data, full end-to-end acceptance, docs/handover, sign-off)

> When a phase is complete AND the user approved the test: create branch `phase-<n>-<slug>`, open a PR to `main`, and record it here. **Never merge/push to main.**
