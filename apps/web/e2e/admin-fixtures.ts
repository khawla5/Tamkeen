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
 * Assigns one of the seeded, assessment-ready paths directly (D-134).
 *
 * Assignment is exercised through the real admin screen once, in the journey
 * suite's own happy path; every other suite that merely needs a learner with
 * an assigned path does it this way, the same reason `seedAdmin` bypasses the
 * registration screen — the mechanics being skipped are not what the test is
 * about, and going through them four times over would prove the same thing
 * four times.
 */
export async function assignSeededPath(
  email: string,
  options: { exclude?: string } = {},
): Promise<{ pathId: string; pathName: string }> {
  return withClient(async (client) => {
    const learner = await client.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      email,
    ]);
    const userId = learner.rows[0]?.id;
    if (!userId) throw new Error(`No user found for ${email}`);

    const path = await client.query<{ id: string; name: string }>(
      `SELECT p.id, p.name
         FROM paths p
        WHERE p.status = 'PUBLISHED'
          AND p.id != COALESCE($1::uuid, '00000000-0000-0000-0000-000000000000')
          AND EXISTS (
            SELECT 1 FROM path_assessments pa WHERE pa.path_id = p.id AND pa.status = 'ACTIVE'
          )
        ORDER BY p.display_order ASC
        LIMIT 1`,
      [options.exclude ?? null],
    );
    const chosen = path.rows[0];
    if (!chosen) throw new Error('No seeded path with a published assessment is available.');

    await client.query(
      `INSERT INTO user_paths (id, user_id, path_id, status, assigned_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'ACTIVE', now(), now(), now())
       ON CONFLICT (user_id, path_id) DO NOTHING`,
      [userId, chosen.id],
    );

    return { pathId: chosen.id, pathName: chosen.name };
  });
}

/**
 * A learner's current placement on one path: the level it put them on, the
 * score, and the assessment version that produced it (D-134, D-049's
 * per-path form).
 */
export async function placementFor(
  email: string,
  pathId: string,
): Promise<{ levelName: string; score: number; assessmentVersion: number }> {
  return withClient(async (client) => {
    const { rows } = await client.query<{
      level_name: string;
      score: number;
      assessment_version: number;
    }>(
      `SELECT lv.name AS level_name, lp.score, r.assessment_version
         FROM learner_placements lp
         JOIN levels lv ON lv.id = lp.level_id
         JOIN path_assessment_results r ON r.id = lp.result_id
         JOIN users u ON u.id = lp.learner_id
        WHERE u.email = $1 AND lp.path_id = $2`,
      [email, pathId],
    );
    const row = rows[0];
    if (!row) throw new Error(`No placement for ${email} on path ${pathId}`);

    return {
      levelName: row.level_name,
      score: row.score,
      assessmentVersion: row.assessment_version,
    };
  });
}

/** Which version new takers of this path's assessment are currently served. */
export async function activePathAssessmentVersion(pathId: string): Promise<number> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ version: number }>(
      `SELECT version FROM path_assessments WHERE path_id = $1 AND status = 'ACTIVE'`,
      [pathId],
    );

    if (!rows[0]) throw new Error(`No active assessment for path ${pathId}`);
    return rows[0].version;
  });
}

/** Assigns one specific path directly — for a suite that has already picked
 *  which one it means to exercise, rather than taking whichever the general
 *  {@link assignSeededPath} would have chosen. */
export async function assignPathById(email: string, pathId: string): Promise<void> {
  await withClient(async (client) => {
    const learner = await client.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      email,
    ]);
    const userId = learner.rows[0]?.id;
    if (!userId) throw new Error(`No user found for ${email}`);

    await client.query(
      `INSERT INTO user_paths (id, user_id, path_id, status, assigned_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'ACTIVE', now(), now(), now())
       ON CONFLICT (user_id, path_id) DO NOTHING`,
      [userId, pathId],
    );
  });
}

/**
 * Removes paths created through the UI during a run.
 *
 * `releaseAdmin` clears accounts, and paths are not accounts — but a path left
 * behind is worse than a stray user: `is_active` decides what every learner is
 * offered, so an abandoned test path would sit in the results screen of every
 * later run and of anyone opening the app. `path_courses` goes first, being a
 * child of both sides.
 */
export async function releasePathsByPrefix(prefix: string): Promise<void> {
  await withClient(async (client) => {
    const { rows } = await client.query<{ id: string }>(`SELECT id FROM paths WHERE key LIKE $1`, [
      `${prefix}%`,
    ]);
    const ids = rows.map((row) => row.id);

    if (ids.length === 0) return;

    await client.query(`DELETE FROM path_courses WHERE path_id = ANY($1)`, [ids]);
    await client.query(`DELETE FROM paths WHERE id = ANY($1)`, [ids]);
  });
}
