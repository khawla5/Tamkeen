import { randomBytes } from 'node:crypto';

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

/* The Playwright runner is its own process and does not inherit the API's
   configuration, so the connection string is loaded here. Same file, same
   database the running API is using. */
loadEnv({ path: ['../../.env'], quiet: true });

/**
 * Puts a signed-in super-admin in front of the browser suite.
 *
 * **The admin account is seeded and everything it then does is not.** There is
 * no self-registration path to a privileged role and there must not be one
 * (D-017), so the first administrator has to arrive from outside the product —
 * exactly as `prisma/seed.ts` does in a real deployment. What the suite proves
 * is everything downstream of that: an organisation created through a screen, an
 * account provisioned through a screen, an invitation redeemed from a real
 * mailbox, and that account signing in to the portal its role belongs to.
 *
 * A *second* administrator is seeded alongside the first. Without one, every
 * last-active-admin guard fires unconditionally and the suite could never
 * demonstrate the allowed direction of a role change — it would look correct
 * whatever the rule said.
 */

export const ADMIN_PASSWORD = 'a-sufficiently-long-password';

/** Unique per process, so a run never collides with dev data or another run. */
const RUN_ID = randomBytes(4).toString('hex');

export interface SeededAdmin {
  email: string;
  /** The spare administrator, so the last-admin guard is not always tripped. */
  spareEmail: string;
  /** Prefix every row this run created shares, for cleanup. */
  prefix: string;
}

async function withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/**
 * The API's own hasher, imported rather than reimplemented.
 *
 * Passwords are argon2id with parameters recorded in the hash string itself
 * (`src/common/password.ts`). A second implementation here would work right up
 * until those parameters changed, and would then fail as "wrong password" —
 * which is exactly how a seeded account becomes an afternoon of debugging.
 * `entity-fixtures` imports it the same way and for the same reason.
 */
async function hash(password: string): Promise<string> {
  const { hashPassword } = (await import('../../api/src/common/password')) as {
    hashPassword: (value: string) => Promise<string>;
  };

  return hashPassword(password);
}

export async function seedAdmin(): Promise<SeededAdmin> {
  const prefix = `pw-admin-${RUN_ID}`;
  const email = `${prefix}@ministry.gov.example`;
  const spareEmail = `${prefix}-spare@ministry.gov.example`;

  await withClient(async (client) => {
    for (const [address, label] of [
      [email, 'main'],
      [spareEmail, 'spare'],
    ] as const) {
      await client.query(
        `INSERT INTO users
           (id, email, password_hash, full_name, employee_id, department, role,
            status, email_verified_at, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'مسؤول النظام', $3, 'إدارة النظام', 'SUPER_ADMIN',
                 'ACTIVE', now(), now(), now())`,
        [address, await hash(ADMIN_PASSWORD), `PWA-${RUN_ID}-${label}`.slice(0, 20)],
      );
    }
  });

  return { email, spareEmail, prefix };
}

/**
 * Removes everything this run created.
 *
 * Order matters and is not incidental: sessions and tokens reference users,
 * users reference entities, and `courses.owner_entity_id` is `Restrict`. An
 * entity created through the UI during the run owns nothing, so it deletes
 * cleanly — but the ordering is written out rather than relied upon, because a
 * failure here leaves rows that break the *next* run rather than this one.
 */
export async function releaseAdmin(admin: SeededAdmin): Promise<void> {
  await withClient(async (client) => {
    const users = await client.query<{ id: string }>(`SELECT id FROM users WHERE email LIKE $1`, [
      `${admin.prefix}%`,
    ]);
    const ids = users.rows.map((row) => row.id);

    if (ids.length > 0) {
      await client.query(`DELETE FROM sessions WHERE user_id = ANY($1)`, [ids]);
      await client.query(`DELETE FROM auth_tokens WHERE user_id = ANY($1)`, [ids]);
      await client.query(`DELETE FROM audit_log WHERE actor_user_id = ANY($1)`, [ids]);
      await client.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
    }

    /* Accounts belonging to an entity created through the UI are cleared above
       by the same email prefix, so the entity is now unreferenced. */
    await client.query(`DELETE FROM entities WHERE key LIKE $1`, [`${admin.prefix}%`]);
  });
}

/**
 * The six scores and the version a person's newest result was taken under.
 *
 * Read straight from the database rather than scraped off the results page: the
 * assertion this exists for is that publishing an edit changed *nothing* here,
 * and a rendered page could show the same numbers while the row underneath had
 * been repointed at a different version.
 */
export async function resultFor(email: string) {
  return withClient(async (client) => {
    const { rows } = await client.query<{
      id: string;
      assessment_version: number;
      score_r: number;
      score_i: number;
      score_a: number;
      score_s: number;
      score_e: number;
      score_c: number;
      max_score: number;
      code: string;
      assessment_id: string;
    }>(
      `SELECT r.id, r.assessment_version, r.score_r, r.score_i, r.score_a,
              r.score_s, r.score_e, r.score_c, r.max_score, r.code, r.assessment_id
         FROM assessment_results r
         JOIN users u ON u.id = r.user_id
        WHERE u.email = $1
        ORDER BY r.completed_at DESC
        LIMIT 1`,
      [email],
    );

    const row = rows[0];
    if (!row) throw new Error(`No assessment result for ${email}`);

    return {
      id: row.id,
      assessmentId: row.assessment_id,
      assessmentVersion: row.assessment_version,
      scores: {
        R: row.score_r,
        I: row.score_i,
        A: row.score_a,
        S: row.score_s,
        E: row.score_e,
        C: row.score_c,
      },
      maxScore: row.max_score,
      code: row.code,
    };
  });
}

/** Which version new takers are currently served. */
export async function activeAssessmentVersion(): Promise<number> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ version: number }>(
      `SELECT version FROM assessments WHERE key = 'riasec-core' AND status = 'ACTIVE'`,
    );

    if (!rows[0]) throw new Error('No active assessment');
    return rows[0].version;
  });
}

/**
 * Returns the instrument to a single active version 1.
 *
 * The suite publishes a real second version against the shared development
 * database, and leaving it in place would change what every later run — and
 * every developer opening the app — is served. Results belonging to versions
 * above 1 go first, because `assessment_results.assessment_id` is `Restrict`:
 * they are the suite's own takers, created and removed within it.
 *
 * Version 1 is reactivated *before* the later ones are deleted, because the
 * partial unique index permits only one ACTIVE row per key.
 */
export async function resetAssessmentVersions(): Promise<void> {
  await withClient(async (client) => {
    const { rows } = await client.query<{ id: string; version: number }>(
      `SELECT id, version FROM assessments WHERE key = 'riasec-core' ORDER BY version ASC`,
    );

    if (rows.length <= 1) return;

    const first = rows[0]!;
    const later = rows.slice(1).map((row) => row.id);

    await client.query(
      `DELETE FROM assessment_responses
        WHERE result_id IN (SELECT id FROM assessment_results WHERE assessment_id = ANY($1))`,
      [later],
    );
    await client.query(`DELETE FROM assessment_results WHERE assessment_id = ANY($1)`, [later]);

    await client.query(`UPDATE assessments SET status = 'RETIRED' WHERE key = 'riasec-core'`);
    await client.query(
      `UPDATE assessments SET status = 'ACTIVE', retired_at = NULL WHERE id = $1`,
      [first.id],
    );
    await client.query(`DELETE FROM assessments WHERE id = ANY($1)`, [later]);
  });
}
