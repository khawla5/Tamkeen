# Phase 0 — Foundations

Implements all seven steps of the Phase 0 checklist. Establishes the locked stack (D-013) as a runnable skeleton plus the cross-cutting concerns that are painful to retrofit.

**Do not merge until CI is green — this PR is the first time the workflow has ever executed.**

Progress log: [`progress.md` → "2026-08-17 — Phase 0 complete; PR opened for review"](../blob/phase-0-foundations/progress.md)

---

## What was built

**0.1 Monorepo & tooling** — npm workspaces (D-020): `apps/api` (NestJS 11), `apps/web` (Next 15 + React 19), `packages/types`. Strict shared `tsconfig`, Prettier + per-workspace ESLint flat configs, `.gitattributes` for LF parity between Windows and CI. Zod-validated environment at boot — the app refuses to start on malformed config. `docker-compose` for PostgreSQL 16 / Redis 7 / Mailpit (D-021).

**0.2 Arabic-first RTL / i18n** — `next-intl` without locale routing (D-024). `lang="ar" dir="rtl"` fixed, all copy in `messages/ar.json` including the document title. The D-018 digits/calendar switch point lives in `packages/types`, shared by web and api so a certificate PDF cannot disagree with the screen that announced it. Self-hosted IBM Plex Sans Arabic (D-023).

**0.3 Design tokens & UI shell** — the seven brand colours declared once, with a shadcn-compatible semantic layer derived from them. RTL-correct nav/page shell using logical properties throughout. `LoadingState` / `EmptyState` / `ErrorState` plus a `DataView` that makes the happy path unreachable without handling all three (§2B DoD 4).

**0.4 Database & migrations** — Prisma 7 with the pg driver adapter (D-026). Foundation tables only: `users`, `auth_tokens`, `sessions`, `audit_log`, `notifications`. Idempotent seed with no known default password. RBAC is role-based and code-defined, deliberately with no permission table (D-027).

**0.5 Auth & security** — restricted registration (D-017), email verification and password reset via single-use hashed tokens, opaque Postgres sessions with immediate revocation (D-028), per-account lockout, double-submit CSRF, a global **fail-closed** session guard, RBAC guard, and an audit trail written from services rather than controllers. Five Arabic RTL auth pages.

**0.6 LMS port (contract-first)** — one `LmsPort` behind the `LMS_PORT` token, expressed in our vocabulary rather than Moodle's, with the contract as an **executable test suite** Phase 2 will run unchanged against the real adapter (D-030).

**0.7 Testing & CI** — Playwright against the built apps, real PostgreSQL and real SMTP. Full CI chain.

---

## How it was tested

| Suite           | Count   | Against                              |
| --------------- | ------- | ------------------------------------ |
| Unit            | **199** | 12 `packages/types`, 113 api, 74 web |
| API integration | **38**  | real PostgreSQL 16                   |
| Browser e2e     | **9**   | real Chromium, built apps, real SMTP |

`format:check`, `lint` (0 warnings) and `typecheck` (strict + `noUncheckedIndexedAccess`) all clean.

Also verified manually end to end: registration through the UI delivers the Arabic verification email to Mailpit, its real token completes verification and sign-in, and token reuse is rejected. `MOODLE_MODE` was exercised in all three states (`mock`, `real`, `real` with no base URL → refuses to boot).

Notable properties asserted rather than assumed:

- **Enumeration resistance** — registration, resend and forgot-password answer identically for known and unknown addresses; login returns one generic error for unknown-email and wrong-password alike, with a dummy argon2 verify equalising timing.
- **Session revocation is immediate** — a test suspends an account and the very next request is rejected.
- **Contrast** — 24 computed WCAG assertions, including negative tests documenting why gold cannot carry body text.
- **The LMS boundary does not leak** — a test asserts Moodle's native field names never reach a caller, and that progress carries no `passed` field.
- **Arabic-first is enforced mechanically** — a catalog test fails the build on empty strings, unbalanced ICU braces, stray English, or hardcoded digits.

---

## Three defects this work uncovered

**1. An authentication bypass (D-029).** `@nestjs/config`'s `ConfigService.get()` reads `process.env` in preference to the validated object, so `ALLOWED_EMAIL_DOMAINS` arrived as a _string_ and the registration domain check became a **substring match** — `attacker@ministry.gov` would have satisfied a gate configured for `ministry.gov.example`, defeating D-017. The pre-existing domain test passed for the wrong reason (`gmail.com` fails a substring check too). Configuration now reads the validated object; tests assert the types and explicit prefix/substring rejection.

**2. A spurious screen-reader announcement.** The required-field asterisk was nested inside `<label>`, making the accessible name `"كلمة المرور*"`. `aria-hidden` on the span does not help, because the label's text content is what gets used. Now a sibling; `required` conveys the requirement.

**3. A duplicated page heading.** `AuthCard` rendered its title as both a `CardTitle` h2 and a visible h1, so every auth page announced its title twice.

(2) and (3) were caught by the e2e suite because its locators are by label and role — a field the test cannot find by label is a field a screen-reader user cannot identify either.

---

## Phase 0 "done when" (CLAUDE.md §7)

- [x] A user can register (per policy, with email verification) and sign in
- [x] RBAC distinguishes the three portal roles
- [x] Auth endpoints are rate-limited
- [x] The RTL dashboard shell renders with real loading / empty / error states
- [ ] **CI runs on a PR** — the workflow is complete and every gate passes locally, but it has never executed. This PR is its first run.
- [x] The mock Moodle service is callable through the shared contract

---

## Decisions recorded

D-020 npm workspaces · D-021 Docker dev dependencies + Mailpit · D-022 dependency overrides for 3 high CVEs · D-023 self-hosted Arabic typeface · D-024 next-intl without locale routing · D-025 gold cannot carry body text at AA; two functional colours · D-026 Prisma 7 + pg adapter · D-027 code-defined RBAC · D-028 opaque Postgres sessions · D-029 configuration read from the validated object · D-030 contract-first LMS port.

---

## Known limitations carried forward

- **Rate limiting is in-process** — per-instance counters, so horizontal scaling multiplies the effective limit. Phase 7 must swap in a shared store. Per-account lockout is in the database and unaffected. `validateEnv` refuses to disable the limiter in production.
- **`postcss` / `sharp` pinned via npm `overrides`** to clear 3 high CVEs while holding the locked Next 15. Each Next upgrade must re-check the pins (Phase 6 dependency review).
- **Narrow-viewport layout not visually verified** — the `md:` breakpoint logic exists, but the browser resize did not take effect during review, so no claim is made. Phase 6.
- **Employee IDs are format-validated, not verified** — real verification needs a ministry roster or `admin-only` provisioning.
- **Entity scoping is not built** — data-scoped filtering belongs with the entity model in Phase 4.
- **Ministry values are placeholders** — the real allowed email domain and employee-ID format are still `ministry.gov.example` and a permissive regex.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
