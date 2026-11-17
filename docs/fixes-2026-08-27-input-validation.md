# Fixes — 2026-08-27, from the input-validation review onward

The registration form's validation was reviewed on request («do we have input
validation?» — answer: yes, client + server per §2), and the review turned into
the following fixes. All are on `feature/tam-139-entity-content-embed`,
uncommitted until the user's go-ahead.

---

## 1. A full name can no longer contain digits

- **What was wrong:** «الاسم الكامل» accepted any non-empty string — `أحمد 123`
  registered fine, on every surface that writes a name.
- **The rule:** a name never contains a digit — Western `0-9`, Arabic-Indic
  `٠-٩`, or Extended Arabic-Indic `۰-۹`. Error code `FULL_NAME_HAS_DIGITS`,
  Arabic copy «الاسم الكامل لا يجوز أن يحتوي على أرقام.»
- **Server (the gate):** one shared regex `FULL_NAME_NO_DIGITS`
  (`apps/api/src/auth/auth.dto.ts`) applied with `@Matches` on **every** DTO
  that writes a name:
  - `RegisterDto` (self-registration)
  - `UpdateProfileDto` (learner profile)
  - `UpdateEntityProfileDto` (entity profile)
  - `CreateAdminUserDto` (admin user creation)
- **Client (feedback before the round trip):** the register wizard's step 2
  checks the mirrored `FULL_NAME_DIGITS` (`apps/web/src/lib/auth-constants.ts`)
  and shows the message under the field. The profile pages surface the server's
  refusal through the existing error translation.
- **Existing data:** untouched — the rule applies when a name is next written;
  no migration rewrites stored names.
- **Tests:** new register-page case typing «أحمد ٣ الموظف» asserts the form
  refuses without calling the API.

## 2. الرقم الوظيفي must be exactly ten digits

- **What was wrong:** the placeholder pattern `^[A-Za-z0-9][A-Za-z0-9-]{3,19}$`
  accepted ids like `EMP-1234`; the ministry format is ten digits.
- **The rule:** default `EMPLOYEE_ID_PATTERN` is now `^[0-9]{10}$` — still a
  configurable setting (D-017), changeable from §4C.6 if the real format
  differs. It gates **self-registration only**; admin-created accounts remain
  exempt by design (`CreateAdminUserDto`'s documented decision).
- **Changed:**
  - `apps/api/src/config/env.schema.ts` default, `.env`, `.env.example`
  - client mirror `EMPLOYEE_ID_PATTERN` in `auth-constants.ts`
  - the register field: numeric keyboard on mobile (`inputMode="numeric"`),
    typing capped at ten characters
  - error copy: «الرقم الوظيفي يجب أن يتكوّن من عشرة أرقام.» — worded, because
    the message-catalogue test forbids hardcoded digits in Arabic copy
- **Tests swept:** nine API e2e suites and the Playwright account factory
  self-registered with alphanumeric ids (`PW-…`, `E2E-…`) that the new pattern
  refuses. All now use a shared `numericEmployeeId()` helper
  (`apps/api/test/employee-id.ts`, mirrored in `apps/web/e2e/account.ts`)
  producing deterministic 10-digit ids unique per run + label.
- **Verified live** against the running API: `EMP-1234` → 400
  `EMPLOYEE_ID_INVALID`; `12345` → 400; a digit-bearing name with a valid id →
  400 `FULL_NAME_HAS_DIGITS`.

## 3. The catalogue's path filter starts on the learner's own path

- **What was wrong:** «المسار» always started on «جميع المسارات», so a learner
  arriving from My Path's «إضافة دورة» had to find and select their own path
  before seeing anything addable.
- **The fix:** the filter initialises to the committed path from the portal's
  already-loaded dashboard state (the same source §4.4 uses for the committed
  path, D-114) — no extra request, the first course list is already filtered.
  «جميع المسارات» stays one selection away; learners without a committed path
  still start on it.
- **Where:** `apps/web/src/app/(portal)/courses/page.tsx`; new
  `src/test/pages/courses.test.tsx` (two cases: committed → preselected and the
  first request carries `pathId`; uncommitted → «جميع المسارات»).

---

**Verification across the set:** typecheck and lint clean; web unit suites
green (register 10, messages 143, courses 2, among 775 total); API unit suite
659 green; live probes against the dev API behaved as specified. The API
integration suites remain CI-gated as documented in progress.md.
