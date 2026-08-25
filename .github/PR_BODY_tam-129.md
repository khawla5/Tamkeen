# TAM-129 — Embed foundation: `local_tamkeensso` author-embed mode, frame-ancestors, and the launch flag

**Branch:** `feature/tam-129-embed-foundation` → `main` · Decision **D-098** · Epic `moodle-embed`

## What was built

The Moodle and API side that lets the entity portal frame Moodle's course editor safely. No UI in this PR — the entity Course Content page that puts the iframe on screen is **TAM-130**, which stacks on this.

**1. Plugin `local_tamkeensso` 0.1 → 0.2**

- `login.php?embed=author` — the same single-use, HMAC-signed handoff (D-044) that `author-launch` already mints; the flag rides beside the token, **not inside the signed payload** (being framed grants nothing). It marks the session as framed and turns editing on (`$USER->editing`, still capability-checked — the edit-mode switch sits in the navbar the embed hides).
- **Framing restricted to the portal:** `allowframembedding` on **and** `Content-Security-Policy: frame-ancestors 'self' <APP_URL>` sent on every page from the `before_http_headers` hook, driven by the new `allowedframeancestor` setting. `allowframembedding` alone would let any site frame a Moodle login page.
- **Chrome hiding when framed** (`before_standard_head_html_generation`, hook API — no theme edit): navbar (site logo, out-of-course entries, user menu), footer, breadcrumb hidden; the secondary course navigation and the course index kept — the quiz editor, question bank and activity settings are reached through them.
- **Two messages to the parent**, target origin = the configured ancestor, never `*`: `tamkeen:ready` on every framed render; `tamkeen:content-changed` on the render after a course-module / section / completion event (observers in `db/events.php` set a session flag; the head hook consumes it).

**2. Setup**

- `infra/moodle/moodle-setup.php --appurl=…` sets `allowframembedding` and the origin; `setup.mjs` honours `MOODLE_SSO_SECRET` / `APP_URL` so a re-run keeps `.env` valid. Three pre-existing bugs fixed on the way: the re-run crash on `role_allow_assign` (unconditional insert), `docker cp` nesting the plugin one level down (Moodle never saw the new version), and PHP CLI run as root leaving cache directories the web server cannot write (`-u daemon`).
- The local Moodle compose file (`docker-compose.moodle.yml`), `infra/moodle/*` and the `moodle:*` npm scripts were previously uncommitted local work these changes sit on; they are included here.

**3. API**

- `LmsPort.courseLaunchUrl(lmsUserId, lmsCourseId, { embed: 'author' })` on both adapters, with a contract case (embed hint on the URL, still fresh per call, still no WS token, absent from the plain handoff).
- `POST /api/entity/courses/:id/author-launch { embed: true }` → `{ url, mode: 'embed' | 'handoff' }`; a malformed flag is a 400. Scoping, audit and single-use unchanged. `EntityAuthorLaunchView.mode` in `@tamkeen/types`; `entityApi.authorLaunch(id, { embed })`.

## How it was tested

- **Against the real Moodle 4.5.4:** `curl -I` shows the `frame-ancestors` header and no `X-Frame-Options`. A throwaway Playwright probe (not committed) framing a fresh `embed=author` URL from `http://localhost:3000` landed on `course/view.php` with `body.editing`, navbar/footer/breadcrumb hidden, secondary nav and course index visible, and received `tamkeen:ready`; adding a URL resource inside the frame delivered `tamkeen:content-changed`. The same probe from `http://127.0.0.1:3000` (a different origin) got a blank frame and no message.
- API unit (moodle + entity modules): 175 green. Entity e2e: 43 green including the two new cases (`frames on request, and says which it minted`, `rejects a malformed embed flag`). Note: the e2e suite boots `AppModule` from `.env`; with `MOODLE_MODE=real` there it needs `MOODLE_MODE=mock SYNC_SCHEDULER_ENABLED=false`.
- Typecheck (api), ESLint, Prettier clean. Pre-existing and untouched: `apps/web/e2e/portal-a11y.spec.ts` fails typecheck on `main`.

## "Done when" it satisfies

TAM-129's acceptance list in `tickets.md`, all five points. Product rules: no new trust (§2 security baseline, D-044), all Moodle access still through the `moodle` module (§2A), audit unchanged.

## Docs

`decisions.md` **D-098** (framing premise: Moodle on a subdomain of the app's site; plugin-not-theme; D-045 amendment for the entity page; D-044 follow-up). `progress.md` 2026-08-25 entry. `tickets.md` TAM-129 marked done.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
