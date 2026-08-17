# decisions.md — Decision Rationale Log

> **Consult this whenever you need to understand *why* something is the way it is before changing it.**
> **Add an entry whenever a decision is made or revised.** Newest on top. Each entry: the decision, why, and alternatives considered/rejected.

---

## D-030 — The LMS boundary is a port in *our* vocabulary, with the contract expressed as an executable test suite
**Decision:** All LMS access goes through one interface, `LmsPort` (`apps/api/src/moodle/lms.port.ts`), injected by the DI token `LMS_PORT`. Three things make it a real anti-corruption layer rather than a proxy:
1. **The types are ours.** `LmsCourse`, `LmsCourseProgress`, `LmsUserRef` — nothing mirrors a Moodle payload. No `fullname`, no `completionstatus`, no `enrolledusercount`. Translating Moodle's shapes is the Phase 2 adapter's job, confined to `real/moodle-http.service.ts`. A contract test asserts Moodle's native field names never appear on a returned object, so a leak fails CI rather than quietly coupling every caller to Moodle's schema.
2. **The contract is executable, not just an interface.** `lms.contract.ts` exports `describeLmsContract(name, factory)` — a suite asserting the *behaviours* callers depend on: `provisionUser` and `enrol` are idempotent, an unenrolled user yields `null` (not an empty object), an enrolled-but-unattempted course reports a **null** grade rather than 0, `listCourses` returns copies rather than shared mutable state, and `courseUrl` embeds no token. A shared interface only proves method names line up; these are what actually break when an implementation is swapped. Phase 2 runs the same suite against the real adapter — if it passes, no caller changes.
3. **No product logic crosses the boundary.** `LmsCourseProgress` carries `gradePercent` and deliberately has **no `passed` field**; a contract test asserts its absence. The pass threshold is a product setting (D-007), so if the LMS decided pass/fail, changing certification policy would mean editing Moodle quizzes.
**Two supporting choices:**
- **`MOODLE_MODE=real` fails loudly.** The Phase 2 adapter exists now, declared `implements LmsPort`, with every data method throwing `NotImplementedException`. Two benefits: the compiler breaks it the moment the port gains a method, so the interface cannot drift ahead of the real adapter unnoticed; and flipping config early produces an explicit refusal rather than an integration that appears to work while reporting every course as empty. `checkHealth()` is the one exception — it reports `reachable: false`, because a health endpoint exists to report bad states, not to crash a dashboard.
- **Mock-only helpers stay off the port.** `simulateCompletion`, `simulateAttempt` and `reset` live on `MockLmsService`, never on `LmsPort` — a real Moodle adapter could not implement them, so putting them on the interface would break the swap. The contract suite touches only port methods.
**Verified:** 40 tests across the contract and wiring suites; `/api/health` reaches the mock through `LMS_PORT` and reports `{"lms":"up","lmsSiteName":"Tamkeen Mock LMS"}`; `MOODLE_MODE=real` boots, reports `"lms":"down"` and throws `Phase 2` on any data call; `MOODLE_MODE=real` without a base URL refuses to boot at all. A wiring test resolves the *same* consumer class under both modes, which is the Checkpoint F claim made checkable.
**Also fixed while here:** `MoodleModule` now imports `AppConfigModule` explicitly instead of relying on its `@Global` registration. Implicit reliance on globalness means a module cannot be compiled in isolation, which turns a unit test into a whole-application boot.
**Rejected:** exposing Moodle's REST shapes directly (couples every caller to the LMS; an LMS change would touch the whole codebase); a port named after Moodle (invites callers to assume Moodle-specific behaviour); returning `passed: boolean` (moves certification policy into the LMS); leaving the real adapter unwritten until Phase 2 (nothing would keep the interface and the future implementation in step); mock methods on the port (makes the swap impossible).

## D-029 — Configuration is read from a validated object, never from `process.env` (security defect fixed)
**Decision:** `@nestjs/config` was removed. `AppConfigService` now holds the object returned by the zod validator and reads directly from it.
**Why — this was a live authentication bypass, not a style preference.** `ConfigService.get()` consults `process.env` *in preference to* the object returned by `validate`, so every setting arrived as the raw environment string rather than its parsed type. The consequences, in order of severity:
1. **`ALLOWED_EMAIL_DOMAINS` came back as the string `"ministry.gov.example"` instead of `["ministry.gov.example"]`.** The registration gate then called `.includes(domain)` on a *string*, which is substring matching — so **`attacker@ministry.gov` would have satisfied a gate configured for `ministry.gov.example`**, and self-registration was open to any domain that happened to be a substring of an allowed one. This defeats D-017, the rule that keeps the system from being an open sign-up.
2. `RATE_LIMIT_ENABLED=false` came back as the string `"false"`, which is truthy — a boolean switch that silently did nothing.
3. Numeric settings came back as strings, so arithmetic on them would concatenate rather than add.
**How it surfaced:** the integration tests could not disable rate limiting and kept returning 429. Chasing *that* symptom is what exposed the type problem underneath. The domain bypass had no failing test of its own — the existing domain test used `gmail.com`, which fails a substring check too, so it passed for the wrong reason. It is worth noting plainly that a green test suite did not catch this.
**Guards added:** `app-config.spec.ts` asserts the *types* coming out of configuration (arrays are arrays, numbers are numbers, `"false"` is `false`), and `registration-policy.spec.ts` gained explicit tests that a domain which is merely a **prefix** or **substring** of an allowed one is rejected.
**Rejected:** keeping `@nestjs/config` with `skipProcessEnv` (relies on remembering an opt-out flag whose absence is silently insecure); casting at each call site (spreads the problem instead of removing it).

## D-028 — Opaque server-side sessions in Postgres; in-process rate limiting for now
**Decision:** Authentication uses **opaque 256-bit random session tokens stored as SHA-256 hashes in a `sessions` table**, delivered in an `httpOnly; SameSite=Strict; Secure` cookie. Not JWTs. Per-account brute-force lockout lives in the database; per-IP rate limiting is `@nestjs/throttler` with **in-process** storage. CSRF is a double-submit cookie/header pair on top of `SameSite=Strict`.
**Why opaque, not JWT:** revocation. A stateless token stays valid until it expires, so suspending an account or signing out cannot take effect immediately. Here both do — an integration test suspends an account and the very next request is rejected. For a government system where "disable this employee's access now" is a real operational requirement, that is worth a database lookup per request.
**Why Postgres, not Redis:** signing in should not depend on a second datastore being healthy. Redis remains in the stack for BullMQ (Phase 2). Keeping sessions in Postgres also lets Phase 5 show an administrator the active sessions on an account, which an opaque Redis key cannot.
**Why only the hash is stored:** the same reasoning as `auth_tokens` — a database dump must not yield presentable sessions. SHA-256 rather than argon2 because these are CSPRNG tokens with no guessable structure; a slow hash protects nothing here and would add latency to every request.
**Rate limiting — the honest limitation:** in-process storage is correct for a single API instance, which is the Phase 0 target, but **counters are per-instance, so horizontal scaling multiplies the effective limit**. Phase 7 must swap in a shared store when it decides the deployment topology. Per-account lockout is unaffected by instance count, and it is the protection that matters against a targeted attack; per-IP throttling mainly blunts broad spraying. `RATE_LIMIT_ENABLED` exists so integration tests can make hundreds of requests, and `validateEnv` **refuses to start with it disabled in production** — a switch that could be flipped in production would defeat the point.
**Also decided:** no `JWT_SECRET` or `SESSION_SECRET` in configuration. There is nothing to sign, and dead config invites someone to "use" it later in a way nobody designed.
**Rejected:** JWTs (no immediate revocation); Redis sessions (extra hard dependency in the sign-in path); signing the session cookie (a 256-bit random value already cannot be forged); relying on `SameSite` alone for CSRF (leaves older browsers and a compromised same-site subdomain uncovered).

## D-027 — RBAC is role-based and code-defined, not a database permission table
**Decision:** Authorization is driven by the `UserRole` enum on `users` (`EMPLOYEE` / `ENTITY` / `SUPER_ADMIN`) plus guards in code. There is **no `permissions` table and no role–permission join table.**
**Why:** The system has exactly three fixed portals, and §6 describes roles, not a configurable permission matrix. Putting permissions in the database implies they are editable at runtime, which creates a privilege-escalation surface — anyone with a single UPDATE on that table becomes a super-admin, and the change leaves no trace in code review. Code-defined roles are versioned in git, reviewable in a PR, and diffable during a security audit, which is what a government system needs. A DB-backed permission matrix is the right answer when customers define their own roles; nobody here does.
**Also considered and deferred:** inventing a fine-grained permission taxonomy now (`assessment:take`, `admin:manage-paths`, …). Rejected as speculation: those strings would describe features that do not exist yet, and Phase 4/5 are the phases that will actually know what an entity or admin may do. Introducing a permission layer later is a contained change *behind the guard*, whereas a wrong taxonomy baked in now would spread through every controller.
**Consequence:** Phase 4 must add entity *scoping* (which courses/learners an entity may see). That is data-scoped filtering, not a new role, and belongs with the entity model in Phase 4. A test asserts the Prisma `UserRole` enum and `USER_ROLES` in `@tamkeen/types` never diverge, since a silent mismatch would make RBAC checks stop matching without failing loudly.

## D-026 — Prisma 7 with the pg driver adapter (schema no longer holds the URL)
**Decision:** Adopt **Prisma 7** rather than pinning Prisma 6. Prisma 7 removed `url` from the `datasource` block, so the connection is configured in two places by design: `apps/api/prisma.config.ts` for CLI/migration commands, and the **`@prisma/adapter-pg` driver adapter** passed to `PrismaClient` for the runtime. The generated client is emitted to `apps/api/generated/prisma` (gitignored) and regenerated by a `postinstall` hook.
**Why:** Prisma 7 is the current major. Starting a system intended to run for years on an already-superseded major buys short-term familiarity and pays for it with an earlier end-of-support and a migration later, during hardening or after launch — exactly when a government system should not be taking framework upgrades. The adapter change is contained: one config file and one constructor.
**Details worth knowing:**
- Prisma 7 also stopped auto-loading `.env`, so `prisma.config.ts` loads the root `.env` explicitly, matching the `envFilePath` the Nest config module uses.
- The datasource URL deliberately does **not** use Prisma's `env()` helper, which throws when the variable is absent. `prisma generate` needs no database and runs on postinstall, so a fresh clone with no `.env` must still install. The fallback is the literal string `postgresql://DATABASE_URL-is-not-set`, so if a command that genuinely needs the database runs unconfigured, the connection error names the missing variable rather than being cryptic.
- CI generates the client and applies migrations before typecheck, because the client is generated rather than committed.
- `npm ls` style caveat: ESLint had to be told to ignore `generated/**` — the machine-written client is not ours to lint.
**Rejected:** Prisma 6 (familiar `url = env(...)`, no adapter, but a shorter support horizon for a long-lived system); committing the generated client (bloats diffs and goes stale against the schema); Prisma Accelerate (a managed proxy is inappropriate for an internal ministry deployment).

## D-025 — Gold cannot carry body text at AA; two functional colours added
**Decision:** Measured contrast forced two adjustments to how the §3 palette is applied. Neither changes a brand value; both constrain or extend usage.
**(a) Gold is a non-text and large-text colour only.** `--color-gold` `#A8863C` measures **3.42:1 on white, 3.08:1 on cream, 3.99:1 on navy** — all below the 4.5:1 AA floor for body text (WCAG 1.4.3). Worse, a *gold fill* fails in both directions: white-on-gold is 3.42:1 and navy-on-gold 3.99:1, so there is no legible body-size label for a solid gold button. Gold is therefore restricted to **borders, focus rings, icons, accent edges, and large/bold text**, where the 3:1 threshold (WCAG 1.4.11) applies and it passes. Where a gold *fill* is needed behind body text — the achievement button, and the "موصى به" recommended badge in Phase 1 — the fill is **`--color-gold-light` `#C9A85C` with navy text, which measures 6.01:1** and passes comfortably.
This turns out to reinforce §3's own instruction rather than fight it: gold was always meant to be scarce and signal-carrying. A palette that physically cannot support gold as a body-text colour is a palette that keeps gold meaning "recommended".
**(b) Two functional status colours added, outside the brand palette:** `--color-danger` `#A32015` and `--color-success` `#1E6F4E`. §2B DoD 4 makes error states mandatory on every data view, and the brand seven contain no signal colour — an error rendered in navy is not an error. Both clear 4.5:1 in *either* direction on white and cream (danger 7.57/6.82, success 6.11/5.51). They are declared in a separate, commented block in `globals.css` so they cannot be mistaken for brand accents and so gold stays scarce.
**Why enforce it in tests:** `src/lib/contrast.test.ts` computes every pairing the design system uses and asserts its required ratio — 24 assertions, including deliberate *negative* tests proving gold body text fails, which document why the restriction exists. WCAG 2.1 AA is a government obligation; "the gold looks fine" is exactly the judgement that fails an audit. A test also means a future palette tweak that breaks AA fails CI instead of shipping. `src/lib/tokens.ts` mirrors the palette for the tests and a test asserts the mirror matches `globals.css`, so the two cannot drift.
**Rejected:** darkening `#A8863C` until it passes for text (changes a locked brand value — not mine to make); using gold body text anyway and accepting the AA failure (a government accessibility obligation is not optional); reusing navy for errors (removes the distinction between "failed" and "normal"); pulling in a full third-party palette for status colours (two values are enough, and more colour weakens gold's signal).

## D-024 — next-intl without locale routing; one formatting layer shared by both apps
**Decision:** `next-intl` is configured **without i18n routing** — no `/ar` URL prefix, no `[locale]` route segment, no middleware. Arabic is the sole locale; `<html lang="ar" dir="rtl">` is fixed, not negotiated. All UI copy lives in `apps/web/messages/ar.json`; no user-visible string is hardcoded in a component, including the document title.
The locale handed to next-intl is the **extended** tag from `formatLocaleTag()` (e.g. `ar-u-nu-latn-ca-gregory`), not bare `ar`, because next-intl passes it straight to `Intl` — so numbers and dates inside ICU messages honour the D-018 digit/calendar switch automatically. The bare `ar` is used for `<html lang>` via `HTML_LANG`, since an extension subtag there would be invalid HTML.
Client components reach the same formatters through `FormatProvider` / `useFormat()`, seeded from the server-resolved context. This exists because `NUMBER_FORMAT` is a server-only variable: without it, client components would have no access to the setting and would drift into calling `Intl` directly — the exact fragmentation D-018 forbids.
**Why no locale routing:** adding `/ar` to every URL of a single-language internal system is permanent noise for a hypothetical future. `next-intl` supports both modes, and the migration path is understood: introducing English means adding a `[locale]` segment and middleware, which is a contained change to routing, not to the message catalogs or the formatting layer.
**Verified:** the same page, rebuilt with only environment variables changed and **zero code edits**, renders `1,248 / 85% / 17 أغسطس 2026` under the defaults and `١٬٢٤٨ / ٨٥٪ / ٤ ربيع الأول ١٤٤٨ هـ` under `NUMBER_FORMAT=arabic-indic DATE_CALENDAR=islamic-umalqura`. A catalog test additionally fails the build on any empty string, unbalanced ICU braces, or stray English copy, so the Arabic-first rule is enforced mechanically rather than by review discipline.
**Caveat:** for statically prerendered pages the setting is baked in at build time, so flipping it on an existing deployment requires a rebuild. Acceptable — it is a one-time deployment choice, and the authenticated pages that dominate this product render per request.
**Rejected:** locale-prefixed routing now (URL noise, no current benefit); letting next-intl own number/date formatting while `packages/types` owns it for the API (two implementations would drift, and a certificate PDF disagreeing with the screen that announced it is a real failure mode); reading `process.env` directly in components (defeats the single switch point).

## D-023 — Self-host the Arabic typeface instead of fetching it from Google Fonts
**Decision:** IBM Plex Sans Arabic is committed to `apps/web/src/fonts` as four "complete" woff2 files (400/500/600/700, ~74 KB each) and loaded with `next/font/local`. `next/font/google` is not used. The OFL 1.1 licence text ships alongside the fonts, since the repo now redistributes them.
**Why:** Three reasons, in order of weight. (1) **Build reliability** — `next/font/google` fetches at build time; the first build here retried the fetch five times before succeeding, and a ministry environment behind a proxy or air-gapped would fail outright. A production build must not depend on reaching a third party. (2) **Privacy** — a Google-hosted font means every employee's browser makes a request to Google carrying its IP and user agent on every visit to an internal government system. That is a needless third-party disclosure of who is using the platform and when, and it is exactly the kind of thing §2's PII-minimisation stance exists to prevent. (3) **Correctness** — the "complete" files cover Arabic glyphs *and* Latin digits in one file per weight, so the Western Arabic numerals that D-018 makes the default render in the same typeface as the Arabic text instead of falling back to a system font. Google's API splits by subset, which cannot express that cleanly through `next/font/local`.
**Verified:** production build succeeds with no network retries; the served page references `/_next/static/media/*.woff2` and contains **no `fonts.googleapis.com` or `fonts.gstatic.com`** reference at all.
**Cost:** ~298 KB of binary in the repo, and the fonts must be refreshed manually if IBM ships an update — a deliberate trade for a build that cannot fail on someone else's uptime.
**Rejected:** `next/font/google` (build-time network dependency + third-party disclosure); depending on the `@ibm/plex-sans-arabic` npm package and pointing `next/font/local` into `node_modules` (avoids committing binaries, but the path is fragile under workspace hoisting); hand-written `@font-face` rules with `unicode-range` (more control, but loses `next/font`'s automatic preloading and layout-shift compensation).

## D-022 — Clear transitive CVEs with npm `overrides` rather than moving off the locked Next.js 15
**Decision:** The first install carried **3 high-severity transitive advisories** through Next 15.5.23 — four `postcss` issues (XSS via unescaped `</style>` in stringify output; arbitrary `.map` file read via attacker-controlled `sourceMappingURL`) and the `sharp`/libvips set (CVE-2026-33327/33328/35590/35591). `npm audit fix --force` resolves them only by installing **Next 16**, which is a breaking change and contradicts D-013. Instead, root `overrides` pin `postcss@^8.5.26` and `sharp@^0.35.3` for the whole tree, including inside `next` (which pins `postcss` exactly at `8.4.31` and `sharp` at `^0.34.3`). Result: **`npm audit` reports 0 vulnerabilities** and Next 15.5.23 still builds, serves, and passes tests.
**Why:** A government system should not begin Phase 0 with known highs baked into its lockfile, and it should not silently defer them to Phase 6 either. Overriding a patch/minor within the same major is low-risk (stable public APIs), and it was verified end-to-end rather than assumed: full production build, the Tailwind v4 CSS pipeline still emitting the brand tokens to the served stylesheet, both apps booting, all tests green. `npm ls` labels the overridden packages `invalid` because they fall outside Next's declared ranges — that is the expected, cosmetic signal of a deliberate override, not a broken tree.
**Why not just accept them:** real exposure here is genuinely low (the postcss issues need attacker-controlled CSS at build time, and ours is repo-authored; the sharp issues need attacker-supplied images through `next/image`). But "low exposure" is an argument for not panicking, not for shipping a red audit — and the override cost nothing.
**Consequence / revisit:** overrides are a standing maintenance obligation — each Next upgrade must re-check that the pins are still needed and still compatible. Phase 6's dependency review owns that check, and should also decide whether to drop the `sharp` pin by disabling `next/image` optimisation entirely (the app has no need to process untrusted images).
**Rejected:** Next 16 now (breaks the locked stack mid-Phase-0, and 15.x is the version the rest of the plan assumes); accepting 3 highs and deferring to Phase 6 (leaves the baseline red for six phases); `npm audit fix --force` (same as adopting Next 16, but without the decision being explicit).

## D-021 — Local dev dependencies run in Docker; Mailpit is the dev mail sink
**Decision:** A root `docker-compose.yml` provides PostgreSQL 16, Redis 7 and **Mailpit** for local development (`npm run db:up` / `db:down`). Development `SMTP_HOST/PORT` point at Mailpit (`localhost:1025`, inbox at `http://localhost:8025`). Postgres/Redis image versions match the CI service containers. This file is a **development convenience only** — real environments, secrets management and deployment topology are Phase 7.
**Why:** No local PostgreSQL was installed (Docker was), so Docker is the lowest-friction path to a working DB and gives dev/CI parity on image versions. Email verification and password reset (0.5) are unusable without somewhere for mail to land; Mailpit makes the verification link readable with **no real SMTP credentials and no risk of mailing a real inbox from a dev box** — which matters because these are ministry-employee addresses.
**Rejected:** Requiring a hand-installed local Postgres (per-machine drift, no CI parity); logging verification links to the console only (works, but hides the actual rendered Arabic email, so RTL email bugs would go unnoticed until late); pointing dev at a real SMTP relay (risks sending mail to real employees during development).

## D-020 — npm workspaces as the monorepo tool
**Decision:** Use **npm workspaces** (`apps/web`, `apps/api`, `packages/types`) rather than pnpm or yarn. `packages/types` is compiled to `dist` and consumed via its `main`/`types` entry points, built by an explicit `build:types` step that runs before typecheck/build.
**Why:** §2A left the workspace tool open ("pnpm/npm/yarn"). npm ships with Node so there is no bootstrap step for a new developer or for CI, and the provided CI workflow already assumed `npm ci`. Compiling the shared package (instead of importing raw source) keeps NestJS's `tsc` build and Next's bundler both working without special-casing, and means the published type surface is exactly what consumers see.
**Rejected:** pnpm (fastest and best at monorepos, but not installed locally and adds an install-pnpm step to CI for no benefit at this repo's size); yarn (same bootstrap cost, no advantage here); a single package with folders (loses the enforced boundary that stops the frontend importing backend internals).

## D-019 — Auth is email/password only (no AD/LDAP); Moodle target = latest 4.5.x LTS
**Decision:** (a) The ministry does not require AD/LDAP integration; the system uses **email/password authentication only** (app is the identity owner, provisioning Moodle accounts behind the scenes). The AD/LDAP hardening path in D-004 is dropped unless the ministry later requests it. (b) Deploy the **latest Moodle 4.5.x LTS** patch (from github.com/moodle/moodle, newest `v4.5.x` tag / download.moodle.org). Requires PHP ≥ 8.1 (8.3 supported), sodium extension, `max_input_vars ≥ 5000`.
**Why:** (a) User confirmed email login is the intended, sole mechanism — removes the biggest Phase 2 auth unknown. (b) 4.5 is the current LTS with security support to 4 Oct 2027; the next LTS (5.3) isn't out yet, so 4.5.x is the stable choice for a government system. General bug-fix support for 4.5.x ended Oct 2025, so always run the newest 4.5 patch for security.
**Rejected:** AD/LDAP/OAuth2 SSO (not wanted); Moodle 5.x non-LTS (shorter support, less stable for gov); pinning an old 4.5.x patch (misses security fixes).

## D-018 — Digits/dates default with a single locale switch
**Decision:** Default to Western Arabic numerals (0-9) and Arabic date presentation (Hijri optional), routed through one locale/formatting layer so Arabic-Indic numerals (٠-٩) can be switched on without touching feature code. Same choice applied to UI, certificates, CV, and all PDFs.
**Why:** Arabic-Indic vs Western digits is a real, visible choice; centralizing it prevents inconsistent mixes across the app and PDFs.
**Rejected:** Hardcoding digits per component (guarantees inconsistency); deferring the choice (RTL/number formatting is painful to retrofit).

## D-017 — Restricted registration (not open public sign-up)
**Decision:** Registration is ministry-scoped by default: admin-provisioned accounts and/or self-registration gated by allowed email domain + valid employee ID. Open public registration is not shipped. A settings toggle allows pure admin-provisioning.
**Why:** Internal government system for ministry employees; open registration would be a security and data-integrity hole.
**Rejected:** Open self-registration (inappropriate for an internal system). *Confirm exact policy with the ministry.*

## D-016 — Certificate verification (ID + QR/public page)
**Decision:** Every certificate has a unique public `verification_id` and a QR/public verification URL that confirms validity (name, course/path, date) without login and without extra PII.
**Why:** Government-issued credentials are commonly verified by third parties; without this the certificates aren't trustworthy artifacts.
**Rejected:** Certificates with no verification (can't be authenticated); exposing full profile on the verification page (unnecessary PII).

## D-015 — Assessment retake locked to pre-commitment; course-edit protection
**Decision:** (a) Users may retake the assessment and get a new Holland Code only before confirming a path; after commitment, both path and result are locked. (b) A course in any user's confirmed path cannot be deleted/unpublished — only hidden from new selections while enrolled users finish; `courses.status` = available / hidden-but-completable / retired.
**Why:** (a) A new code is meaningless once the path is permanent (one-path rule) and inviting retakes post-commitment contradicts it. (b) Prevents pulling content out from under a mid-path learner — an operational hazard left undefined before.
**Rejected:** Unlimited retakes anytime (conflicts with one-path rule); hard-deleting courses (breaks in-progress learners).

## D-014 — Engineering standards & Definition of Done; "the test" defined
**Decision:** Locked §2B: per-task Definition of Done, required testing (unit + integration + at least one e2e happy path per phase; explicit RIASEC scoring tests; mock Moodle must share the real module's contract), mandatory loading/empty/error states, WCAG 2.1 AA, and conventions (branch naming, Conventional Commits, `.env.example`, CI gates). This defines what "the test" in the git/PR rule means.
**Why:** The PR rule referenced "the test" without defining it; an agent needs concrete, uniform quality gates or testing/coverage will be inconsistent. Government context demands accessibility, security, and reliability baselines.
**Rejected:** Leaving testing/quality implicit (inconsistent, unverifiable "done"); UI without mandated states (dead/blank/error-swallowing screens).

## D-013 — Tech stack & architecture
**Decision:**
- **Frontend:** Next.js 15 (React + TypeScript), Tailwind CSS, shadcn/ui, `next-intl` (Arabic-first RTL).
- **Backend:** NestJS (Node.js + TypeScript) as a **dedicated API**, not Next.js route handlers.
- **DB:** PostgreSQL + Prisma ORM.
- **Async/jobs:** Redis + BullMQ (scheduled Moodle completion sync, certificate generation).
- **PDF:** headless-Chromium (Puppeteer) HTML→PDF for Arabic-correct certificates + CVs.
- **Moodle:** v4.5 LTS, Web Services (REST) + Catalyst RESTful plugin; access isolated behind one NestJS "Moodle integration" module (anti-corruption layer). Least-privilege token, stored server-side only.
- **Auth:** app is IdP (email/password, verified); JWT/session for the app; token-mapped Moodle handoff for MVP, OAuth2/AD-LDAP as hardening target.
**Why:** The system is integration-heavy and long-lived with background jobs, RIASEC scoring, certificate generation, three role-based portals, and government-grade audit/security needs. A dedicated opinionated backend (NestJS) keeps that maintainable and scalable far better than packing logic into Next.js handlers (industry consensus: Next.js-only backends accrue refactor debt past ~18 months for team-scale, logic-heavy systems). Shared TypeScript lets front/back share the RIASEC + path types. Postgres/Prisma is the safe system-of-record choice. Chromium-based PDF is the most reliable route to correct Arabic RTL shaping. Moodle 4.5 LTS is supported to late 2027; the RESTful plugin gives real HTTP status codes instead of always-200. Isolating Moodle behind one module means an LMS change touches one place.
**Rejected:** Next.js-only full-stack (logic/jobs/roles outgrow route handlers); Express (less structure than NestJS for a multi-portal system); Django/Laravel (loses shared-TypeScript benefit); non-LTS Moodle (shorter support window); common PDF libs without robust Arabic shaping (RTL/ligature bugs).

## D-012 — Comprehensive 8-phase plan with done-criteria
**Decision:** Expand the phase plan to 0–7, each with goal/deliverables/"done when"; split entity and super-admin into separate phases; add a dedicated deployment + acceptance phase. Project isn't "done" until Phase 7 acceptance passes.
**Why:** User asked for the phases to make the system comprehensive and fully functional. Explicit done-criteria and a deployment/acceptance phase prevent a "features built but not launchable" outcome.
**Rejected:** The earlier 6-phase sketch (bundled admin portals, no explicit deployment/acceptance, no per-phase done-criteria).

## D-011 — Assessment is Holland (RIASEC); paths tagged by letter; gold = letter in top-three code
**Decision:** Use the Holland Codes / RIASEC framework. Scoring tallies points per dimension → ranked profile → top-three **Holland Code**. Every path is tagged with one **primary RIASEC letter**. A path is recommended (gold) if its letter is in the user's top-three code, ranked by the user's letter order. Non-matching paths remain selectable. Store all six dimension scores, not just the code.
**Why:** User specified a Holland-based assessment with each path linked to a Holland category. Top-three code is the standard Holland output and richer than a single letter; storing all six enables ranking and later re-explanation. Matching by "letter ∈ top-three code" preserves the single-path rule while using the real framework and keeps gold meaningful without caging the user.
**Alternatives considered:** Match only the single #1 letter (too narrow — most careers are blends, and few paths would be gold); reduce the result to one opaque letter (loses the framework's value). If stricter/looser matching is wanted later, revise this entry.

## D-010 — Three-file context engineering (CLAUDE.md / progress.md / decisions.md)
**Decision:** Maintain three files: `CLAUDE.md` (rules Claude Code follows), `progress.md` (running state), `decisions.md` (this file, rationale). Every session reads CLAUDE.md → progress.md → decisions.md as needed, and updates progress.md (and decisions.md on any decision) before ending.
**Why:** Survives cleared chats / new sessions. State and rationale persist outside the conversation so a fresh session can continue coherently.
**Rejected:** Relying on chat memory alone (lost on reset); a single README (mixes stable rules with volatile state).

## D-009 — Color system fixed as design tokens
**Decision:** Navy `#222E42`, Secondary Navy `#2E3A50`, Gold `#A8863C`, Cream `#F4F3F1`, White `#FFFFFF`, Light Gold `#C9A85C`, Muted Blue `#5E6B85`. Gold reserved for recommended-path highlight and achievement accents.
**Why:** Consistency + the gold signal only works if gold is scarce.
**Rejected:** Ad-hoc coloring; heavy gold usage (dilutes the "recommended" signal).

## D-008 — PR-only workflow, never touch main
**Decision:** All work on feature branches; open a PR to `main` only after the user approves the test; never merge or push to `main` directly.
**Why:** Government system — human review gate is essential; protects main.
**Rejected:** Direct commits to main (unsafe, unreviewable).

## D-007 — Pass threshold is a product setting, evaluated against Moodle grade
**Decision:** The "passed well enough for a certificate" threshold lives in our system config and is checked against the grade Moodle returns.
**Why:** Lets us control certification policy without editing Moodle quizzes; keeps product logic in the product.
**Rejected:** Encoding the threshold inside Moodle (splits product logic into the LMS).

## D-006 — Certificates issued by our app, idempotent
**Decision:** Generate certificates as Arabic PDFs from our own templates; check "already issued?" before creating one.
**Why:** Consistent branding/Arabic template control; polling-based sync would otherwise create duplicates.
**Rejected:** Moodle certificate plugin (less control over Arabic template + product coupling); non-idempotent issuance (duplicate certs).

## D-005 — Completion sync via scheduled job (MVP)
**Decision:** Backend polls Moodle completion/grade functions for enrolled users every few minutes; webhooks are a later optimization.
**Why:** Simpler and more reliable to build first; minutes of latency is fine for training.
**Rejected (for now):** Webhooks/events first (more moving parts before the core loop is proven).

## D-004 — MVP auth = token-mapped handoff; SSO/OAuth2 = hardening target
> **Update (D-019):** the AD/LDAP option is dropped — auth is email/password only. OAuth2 remains only an optional internal convenience for the Moodle handoff, not a ministry SSO requirement.
**Decision:** App is the identity owner (email/password). Create a Moodle user per registrant (`moodle_user_id`), use token-mapped auto-login/handoff for course entry in MVP. Move to OAuth2 IdP (or AD/LDAP if the ministry has it) during hardening.
**Why:** Get a working single-login experience fast; defer the heavier SSO build until the flow is proven. AD/LDAP existence must be confirmed early as it reshapes auth.
**Rejected:** Building full OAuth2 SSO up front (slower MVP); two separate logins (bad UX).

## D-003 — One Moodle course, multiple paths; reuse completion
**Decision:** A single Moodle course can belong to several paths. If a user already completed a shared course, reuse that completion — no retake.
**Why:** Avoids duplicate content and pointless repeat work; one source of truth per course.
**Rejected:** Duplicating courses per path (content maintained twice); forcing retakes (frustrating, wasteful).

## D-002 — One path per user, no switching
**Decision:** A user commits to exactly one path; it cannot be switched after confirmation. Confirm is a hard gate with an Arabic confirmation dialog.
**Why:** Simplifies state (effectively one active `user_paths` record), keeps the experience focused. (User instruction, "for now.")
**Rejected:** Multiple concurrent paths / free switching (more complex state, diluted focus). Revisit only if the user later requests it.

## D-001 — Arabic-first is architecture, not styling
**Decision:** RTL layout, Arabic default locale, Arabic-capable PDF rendering set from Phase 0.
**Why:** Retrofitting RTL and Arabic PDF shaping later is painful and error-prone; it's a primary requirement.
**Rejected:** English-first with later Arabic pass (would compromise the core requirement).

## D-000 — App is the experience layer, Moodle is the learning engine
**Decision:** Our app owns users/auth, assessment, paths, path membership, certificates, CV, UX. Moodle owns course content, quizzes, grading, completion. Bridges are only `moodle_user_id` and `moodle_course_id`; completion flows one direction (Moodle → our DB → certificate logic). Course content is never authored twice.
**Why:** Don't rebuild what Moodle does well; keep product logic in the product and a single source of truth per concern.
**Rejected:** Building our own LMS (huge, redundant); duplicating course content in both systems (sync hell).
