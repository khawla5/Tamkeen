# `local_tamkeensso` — seamless login for the Tamkeen platform

A learner signed in to Tamkeen must reach a Moodle course **without meeting a
second login** (CLAUDE.md §5.3, D-044). Core Moodle cannot do this for an
arbitrary user: every mechanism it offers mints a session for the web-service
token's *own* user, and our integration token belongs to the integration
account, not to the learner.

This plugin closes that gap. Tamkeen mints a short-lived, single-use,
HMAC-signed token bound to **one user and one course**; the plugin verifies it
and logs that learner straight into that course.

> **⚠ Governance.** Installing custom PHP on the ministry's production Moodle is
> **not yet approved**. This plugin is approved for the **pilot** only. If the
> ministry refuses custom plugins, seamless login must move to the OAuth2-IdP
> route (Option B, §5.3) during hardening. See D-044.

---

## What it is, in one paragraph

One page (`login.php`), one settings field (the shared secret), one table
(spent token identifiers). No web services, no scheduled tasks, no capabilities,
no user data. It reads a token, checks four things, and calls Moodle's own
`complete_user_login()`.

## Security properties

Each exists because removing it opens a specific hole:

| Property | Without it |
|---|---|
| **HMAC-SHA256 signature**, verified with `hash_equals` (constant time) | Anyone could mint a login for any user id |
| **Short expiry** (60s by default, hard-capped at 300s) | The URL reaches the browser — history, referrer headers, screenshots — and would stay usable |
| **Single use**, enforced by a `UNIQUE` index on the nonce | Expiry alone still leaves a replay window to whoever reads the URL |
| **Bound to one user AND one course** | A stolen token would buy entry to Moodle, rather than to the one course its owner already had |

Also: the endpoint sends `Cache-Control: no-store` and `Referrer-Policy: no-referrer`,
never echoes the token in an error page, and replaces any *other* user's existing
session rather than reusing it — otherwise a shared machine would carry one
learner's session into another learner's course.

The token is **not** a bearer credential for Moodle's API and never contains the
web-services token. It is a capability to start one session, for one person, in
one course, within one minute.

---

## Installation

### 1. Copy the plugin into Moodle

**The destination differs by Moodle version, and getting it wrong means the
plugin silently never loads.** Moodle 5.0 moved the web-facing tree into
`public/`:

| Moodle | Destination |
|---|---|
| **4.5 LTS** (production target, D-039) | `<moodleroot>/local/tamkeensso` |
| **5.x** (the dev instance) | `<moodleroot>/public/local/tamkeensso` |

Copy the `local_tamkeensso` directory there and rename it to `tamkeensso` — the
directory name must be `tamkeensso`, not `local_tamkeensso`, because Moodle
derives the component name from `local/` + the folder name.

Docker example (5.x layout):

```bash
docker cp moodle-plugin/local_tamkeensso <container>:/var/www/html/public/local/tamkeensso
docker exec <container> chown -R www-data:www-data /var/www/html/public/local/tamkeensso
```

### 2. Run the upgrade

Either visit **Site administration → Notifications** in the browser and follow
the prompt, or:

```bash
docker exec <container> php /var/www/html/admin/cli/upgrade.php --non-interactive
```

Note the CLI path stays `admin/cli/upgrade.php` even on 5.x — only the
*web-facing* tree moved to `public/`.

### 3. Set the shared secret

It must be **at least 32 characters** and identical on both sides. The plugin
refuses to run if it is shorter, and so does the Tamkeen API — a short secret
makes the signature decorative rather than protective.

Generate one:

```bash
openssl rand -base64 48
```

In Moodle, either **Site administration → Plugins → Local plugins → Tamkeen
seamless login**, or:

```bash
docker exec <container> php /var/www/html/admin/cli/cfg.php \
  --component=local_tamkeensso --name=secret --set='<the-secret>'
```

In Tamkeen, set the same value in `.env`:

```
MOODLE_SSO_SECRET=<the-secret>
MOODLE_SSO_TTL_SECONDS=60
```

### 4. Check it

```bash
npx tsx spike/verify-sso.ts
```

This mints a real token, spends it, and asserts that a replayed token, a forged
token and an expired token are all refused.

---

## Rotating the secret

Change it in both places. In-flight handoff links break, but they expire within
a minute anyway, so the practical blast radius is "a learner clicking at that
exact moment clicks again".

## Uninstalling

Remove the directory and visit Site administration → Notifications. The plugin
owns one table, which Moodle drops for you.

## What it stores

`local_tamkeensso_used` holds spent token identifiers: a random nonce, the user
id it was minted for, and two timestamps. Rows older than a day are deleted
opportunistically on each request. There is no personal data, and the privacy
provider says so.
