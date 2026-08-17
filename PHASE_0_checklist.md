# Phase 0 — Foundations: task checklist

> Goal: a runnable skeleton with the cross-cutting concerns that are painful to retrofit. **Foundations only — no Phase 1 product logic (no assessment, paths, or gold).**
> Work on branch `phase-0-foundations`. Pause for review at each **CHECKPOINT**.

## 0.1 Monorepo & tooling
- [ ] Init monorepo: `apps/web` (Next.js 15 + TS), `apps/api` (NestJS + TS), `packages/types` (shared domain types).
- [ ] Workspace setup (pnpm/npm/yarn workspaces), shared TS config, ESLint + Prettier, strict TypeScript.
- [ ] Commit `.gitignore`, `.env.example`, and the CI workflow (provided).
- [ ] Conventional Commits in use.
- **CHECKPOINT A:** repo installs and both apps boot with a hello-world; CI is green on the first PR-sized commit.

## 0.2 Arabic-first / RTL / i18n
- [ ] `next-intl` configured; Arabic (`ar`) is the default locale; `dir="rtl"` and `lang="ar"` set at the root.
- [ ] Message catalog structure in place (no hardcoded UI strings).
- [ ] Decide + implement the digits/date default (Western Arabic numerals by default, single formatting layer — see CLAUDE.md §2 / D-018).
- **CHECKPOINT B:** a sample page renders correctly RTL in Arabic; switching the number-format flag works in one place.

## 0.3 Design tokens & UI shell
- [ ] Tailwind + shadcn/ui installed; the 7 color tokens (CLAUDE.md §3) defined as CSS variables / Tailwind theme.
- [ ] App layout shell: sidebar/nav frame, page container — all RTL-correct, on-brand.
- [ ] Reusable **loading / empty / error** state primitives (used by every future data view).
- [ ] Base accessibility conventions (semantic markup, focus states, labelled inputs, contrast).
- **CHECKPOINT C:** the shell looks clean/modern in the navy/gold palette and demonstrates the three states.

## 0.4 Database & migrations
- [ ] PostgreSQL + Prisma set up; migration tooling working.
- [ ] Schema for the foundation tables: `users` (incl. `moodle_user_id` nullable for now), roles/permissions (RBAC), `audit_log`, `notifications`. (Product tables like paths/courses/assessment come in later phases — stub only what auth/RBAC needs now.)
- **CHECKPOINT D:** migrations run clean; seed a super-admin account.

## 0.5 Auth & security foundation
- [ ] Email/password auth (argon2/bcrypt), **restricted registration** per D-017 (allowed-domain / employee-ID gate or admin-provisioned; NOT open sign-up).
- [ ] Email verification + password reset (transactional email; SMTP via env).
- [ ] Sessions or JWT with secure/httpOnly handling; CSRF protection.
- [ ] **Rate-limiting + brute-force lockout** on auth endpoints.
- [ ] **RBAC** enforced: employee / entity / super-admin roles distinguished at the API.
- [ ] **Audit-log** writes on login, and a documented pattern for logging future data-changing actions.
- **CHECKPOINT E:** a user can register (per policy), verify email, sign in, reset password; RBAC blocks cross-role access; auth endpoints are rate-limited.

## 0.6 Mock Moodle service (contract-first)
- [ ] Define the `moodle` module **interface** in the API (the methods Phase 2 will implement for real: create user, enrol, get courses, get completion + grade, site info).
- [ ] Provide a **mock implementation** returning canned data behind that exact interface.
- [ ] Config switch selects mock vs real (real is unimplemented until Phase 2).
- **CHECKPOINT F:** callers depend only on the interface; the mock is swappable without touching callers.

## 0.7 Testing & CI gates
- [ ] Unit test harness (API + web); e2e harness (web).
- [ ] At least one **e2e happy-path test for the auth flow** (register → verify → sign in).
- [ ] Unit tests for auth/RBAC logic and the mock Moodle contract.
- [ ] CI runs lint + typecheck + tests on every PR and must be green.
- **CHECKPOINT G:** CI green; DoD (§2B) met for everything built.

## Phase 0 "done when" (from CLAUDE.md §7)
- [ ] A user can register (per policy, with email verification) and sign in.
- [ ] RBAC distinguishes the three portal roles.
- [ ] Auth endpoints are rate-limited.
- [ ] The RTL dashboard shell renders with real loading/empty/error states.
- [ ] CI runs on a PR.
- [ ] The mock Moodle service is callable through the shared contract.

## Closing the phase
- [ ] Update `progress.md` (what was built, what's next = Phase 1, any blockers) and `decisions.md` (if anything was decided).
- [ ] Open PR `phase-0-foundations` → `main` with what/how-tested/done-when. **Do not merge** — human review.
