import { createHash, randomBytes } from 'node:crypto';

/**
 * How our users map onto Moodle accounts (D-038).
 *
 * The short version: **we key Moodle accounts on a username we derive, not on
 * Moodle's email index.** That is not a stylistic preference — under a
 * least-privilege token Moodle simply will not answer email queries. The Phase 2
 * spike found that `core_user_get_users_by_field` with `field=email` returns an
 * **empty list** for an address that certainly exists, and strips `email` from
 * the response entirely. Both are the missing `moodle/site:viewuseridentity`
 * capability, and both are **silent** — no exception, no warning.
 *
 * An adapter trusting that lookup would conclude "no such user" on every retry
 * and create a duplicate account each time, until `users.moodle_user_id`'s
 * unique index failed somewhere unrelated. Since we are the identity owner
 * (D-000), the username is ours to choose, and a key we control is strictly
 * better than an index we cannot query.
 */

/** Moodle's default username policy allows lowercase alphanumerics and `._-@`. */
const ALLOWED = /[^a-z0-9._-]/g;
const MAX_LOCAL_PART = 24;
const DIGEST_LENGTH = 10;

/**
 * The Moodle username for one of our users. Pure and deterministic: the same
 * address always yields the same username, on any machine, forever.
 *
 * The digest is taken over the **whole** address, not just the local part, so
 * `a.hassan@one.gov` and `a.hassan@two.gov` cannot collide onto one Moodle
 * account — which would silently merge two employees' course records.
 */
export function deriveMoodleUsername(email: string): string {
  const normalised = normaliseEmail(email);
  const digest = createHash('sha256').update(normalised).digest('hex').slice(0, DIGEST_LENGTH);

  const local = (normalised.split('@')[0] ?? '')
    .replace(ALLOWED, '.')
    .replace(/^[._-]+/, '')
    .slice(0, MAX_LOCAL_PART);

  /* The readable prefix is a convenience for whoever reads Moodle's user list;
     the digest is what actually guarantees uniqueness. An address whose local
     part survives sanitisation as empty still gets a valid, stable username. */
  return local.length > 0 ? `${local}-${digest}` : `u-${digest}`;
}

/** One definition of "the same address", shared by every lookup and comparison. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Splits our single `fullName` into the two fields Moodle demands.
 *
 * Moodle requires both `firstname` and `lastname` to be non-empty, while our
 * user model deliberately holds one name field. Splitting on the first
 * whitespace run keeps Arabic names intact (`عبد الله محمد الحربي` →
 * `عبد` / `الله محمد الحربي`), which is imperfect as a *name* but correct as a
 * *label*: these values exist only so Moodle has something to show, and our own
 * database remains the authority on how a person is named.
 */
export function splitFullName(fullName: string): { firstname: string; lastname: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    /* Never send an empty string: Moodle rejects it, and failing to provision an
       account over a blank display name would be an absurd reason to block a
       learner. */
    return { firstname: 'مستخدم', lastname: '—' };
  }

  if (parts.length === 1) {
    return { firstname: parts[0]!, lastname: '—' };
  }

  return { firstname: parts[0]!, lastname: parts.slice(1).join(' ') };
}

/**
 * A password for the Moodle account that **nobody ever learns**, including us.
 *
 * We are the identity owner: employees authenticate against our app and reach
 * Moodle through the handoff. Generating a strong random password and discarding
 * it makes the Moodle account unreachable by direct login *by construction*,
 * rather than by a setting someone can change later. It also means there is no
 * second credential to store, rotate, leak or reset.
 *
 * Composed to satisfy Moodle's default policy (8+ chars, with lower, upper,
 * digit and non-alphanumeric) so provisioning cannot fail on password rules.
 */
export function generateUnusedPassword(): string {
  const groups = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%^&*-_'];

  /* randomBytes, not Math.random: this value is never used, but a predictable
     password on an account that exists is still a weakness worth not having. */
  const bytes = randomBytes(24);

  return Array.from(bytes, (byte, index) => {
    const group = groups[index % groups.length]!;
    return group[byte % group.length]!;
  }).join('');
}
