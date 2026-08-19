# Phase 2 — Moodle integration

Replaces the mock LMS with a real Moodle client. **No caller of `LmsPort` changed in any of the six checkpoints** — the port, the executable contract and the mock, all built in Phase 0, did exactly the job they were built for.

Links to [`progress.md`](../progress.md) entries dated 2026-08-18 and 2026-08-19.

---

## What was built

| Checkpoint                                           | Commit    |
| ---------------------------------------------------- | --------- |
| Spike — prove the loop before building               | `8580405` |
| Real client + idempotent user provisioning           | `80a7ffa` |
| Catalogue sync                                       | `3db20f2` |
| Enrolment, per-course resilient, with reconciliation | `44e771f` |
| Completion sync, pass threshold, scheduled job       | `14835b8` |
| Seamless login (`local_tamkeensso`)                  | `1701680` |
| Course player                                        | `21ba289` |
| Full real-Moodle test pass                           | `25348b4` |

Plus `c1feb81`, which records the dependency-advisory decision.

---

## How it was tested

### Automated

| Suite                              | Count   |
| ---------------------------------- | ------- |
| API unit                           | **352** |
| API integration (real PostgreSQL)  | **96**  |
| Web unit                           | **142** |
| Browser e2e (Chromium, built apps) | **14**  |

Typecheck, lint and format clean across both apps.

### Against a real Moodle 5.2.2

The spike proved the loop before any code was written; the final pass proved the built product closes it. `MOODLE_MODE=real`, an isolated database, the BullMQ scheduler polling every minute, and a human taking a real quiz.

The journey runs **over HTTP only**, so nothing it proves can be a rule living solely in a React component. Enrolment was then asked of Moodle directly rather than trusted from our own status field.

The loop closed with no manual trigger — the scheduler logged `1 newly passed`, then `0 newly passed` on the very next run:

```
PASS  the app records the course as completed     status = COMPLETED
PASS  the grade came back from Moodle             gradePercent = 100
PASS  passed against the product threshold        passed=true at threshold 70
PASS  exactly one course-passed email was sent    1 email(s)
PASS  a second sync changes nothing               COMPLETED/100 → COMPLETED/100
PASS  and does NOT send the email again           1 email(s) after a second sync
```

`completions` read directly: **5 rows, 5 distinct `(user, moodle_course_id)` keys** after a dozen cycles. Unattempted courses carry `grade_percent NULL`, **not 0** — the distinction that would otherwise read as a failed attempt.

Reproducible: `scripts/real-pass-setup.ts`, then `spike/real-pass-journey.mjs`, then `spike/real-pass-verify.mjs --check`.

---

## The "done when" (§7)

> _A real user can, from the app, enter a real Moodle course, take its quiz, and have the app reflect completion + pass/fail automatically and idempotently (re-running the sync never double-processes). Shared-course completion is reused. The mock→real swap changed only the implementation, not callers._

Met. Shared-course reuse is keyed on `(user, moodle_course_id)` and covered by unit tests; the single-path rule means it rarely triggers in practice, exactly as §2 anticipates.

---

## Findings that shaped the design

Each of these was found by running against a real Moodle, not by reading documentation, and each is recorded with its reasoning in `decisions.md`.

**Email lookup fails silently under a least-privilege token (D-038).** `core_user_get_users_by_field` with `field=email` returns an empty list for an address that certainly exists, and strips `email` from responses. No exception, no warning. An adapter trusting it would create a duplicate Moodle account on every retry. Accounts are therefore keyed on a **username we derive ourselves** — we are the identity owner, and a key we control beats an index we cannot query.

**`enrol` throws _after_ it has already committed (D-038, D-041).** Moodle failed on the course-welcome email with the enrolment already written. The same reasoning covers a timeout, where the request may well have landed. `enrol` now verifies before believing its own error; otherwise the audit log would record successful enrolments as failures and reconciliation would "repair" them forever.

**`core_course_get_courses` omits `visible` (D-038).** It is gated behind `moodle/course:update`, which a least-privilege integration user must not hold — and `visible` is what drives our `courses.status` rule. Sync uses `core_course_get_courses_by_field` instead.

**`completionstatus.timecompleted` does not exist (D-038).** The timestamps live on the individual criteria. Reading the obvious field returns `null` on a course that is demonstrably complete.

**Only a course-total grade item is returned (D-038).** Preferring a quiz item "when present" would silently change the grade source between instances, so the course total is used always — which is also the right product semantics.

**Catalogue sync is destructive by default if written naively (D-040).** A vanished course is never deleted and is only retired when **no learner holds it** (`RETIRED` is invisible even to someone who selected it, so retiring an in-use course would breach D-015). An empty catalogue is treated as a fault rather than as "everything was deleted". And letting the LMS's `null` overwrite an authored `durationMinutes` would have erased every duration on the first run **without erroring**, because the column is nullable.

**Core Moodle cannot do admin-initiated SSO (D-044).** Every core mechanism mints a session for the _token's own user_, and our token is the integration account. Hence `local_tamkeensso`: a short-lived, single-use, HMAC-signed token bound to one user and one course. Replay, forgery and expiry are all refused — verified against the running plugin, not argued.

---

## Review notes

**Security surface worth a close read:**

- `moodle-handoff.ts` and `moodle-plugin/local_tamkeensso/login.php` — the two halves of the handoff. A unit test pins the wire format the PHP must match, and a TS-minted token was verified by the plugin's PHP inside the container.
- `moodle-ws.client.ts` — the WS token is posted in the body, never logged, and never placed in a thrown error. A test asserting that is what removed Moodle's raw message from `MoodleWsError`: a debug response can echo the request back.
- `POST /api/courses/:id/launch` — minted per click, never rendered into a page. Two tests assert the markup contains no credential.

**`courseUrl` was removed from `CourseDetail` and `MyPathCourseView`.** Both screens previously linked straight at the Moodle deep link, which carries **no session**. With a working handoff in place, leaving the unauthenticated link in the contract would leave the wrong thing equally available.

**The mock was made stricter twice**, both times because a test failed against it that would have passed in production — a mock easier to satisfy than reality lets real bugs through.

---

## ⚠ Not done, and deliberately so

1. **Seamless login is unverified on Moodle 4.5**, which is what production will run (D-039). It is built and proven on 5.2.2. Note 5.x moved the web tree into `public/`, so the plugin install path differs between the versions — both are documented in `moodle-plugin/README.md`, and getting it wrong means the plugin silently never loads.
2. **Ministry approval for custom Moodle plugins is unconfirmed** (D-044). `local_tamkeensso` is approved for the **pilot** only. If refused, seamless login must move to the OAuth2-IdP route during hardening — a materially larger piece of work, so the answer should be chased early.
3. **`npm audit` reports 3 high advisories** for `deepmerge-ts` via `prisma` → `@prisma/config` (D-043). **Not introduced here** — traced, and not from BullMQ. Accepted and deferred to the Phase 6 dependency review: npm's fix downgrades Prisma to 6.x and breaks D-026, and an `overrides` pin has no effect. Exposure is Prisma's config loader, not the request path.
4. **Certificates are Phase 3.** Sync stops at recording completion and pass/fail; `onCoursePassed` is the seam where issuance plugs in, and it will still need its own idempotency check.
5. **Completion sync processes every eligible learner in one pass**, with no batching or rotation. A silent cap would starve whoever fell outside it; Phase 6 owns making this scale.
6. **The optional `enrollments` table (§6) is still not built** (D-041). `user_path_courses.enrolled_at` answers the only question anything asks.
7. **The dev Moodle needed four role fixes the original setup list missed** — `moodle/role:assign`, the Allow-role-assignments matrix row, `gradereport/user:view`, and disabling the manual-enrolment welcome message. **The same list applies to the ministry's Moodle.**

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
