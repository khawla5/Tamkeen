import { randomBytes } from 'node:crypto';

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

/* The Playwright runner is its own process and does not inherit the API's
   configuration, so the connection string is loaded here. Same file, same
   database the running API is using. */
loadEnv({ path: ['../../.env'], quiet: true });

/**
 * Puts an entity account and a course it owns in front of the browser suite.
 *
 * **Why the account is seeded rather than created through a UI.** Entity
 * accounts are provisioned by the super-admin portal, which is Phase 5 — there
 * is no screen that creates one yet, and shipping a self-registration path for
 * privileged accounts to make a test easier would defeat D-017 outright. The
 * seed does exactly what Phase 5's admin screen will do, so the state the
 * browser then exercises is the state a real provisioning produces.
 *
 * **Why the publishable course is borrowed from the seeded catalogue.** The mock
 * LMS reports a *newly created* course as having no completion criteria, which
 * is the honest simulation (a real Moodle course is empty until someone authors
 * it) and is exactly what the publish gate must refuse. Making it report
 * otherwise needs `simulateAuthoring`, which lives in the API process and cannot
 * be reached from here. So the suite proves the refusal on a course it creates
 * through the UI, and proves publish/unpublish on a seeded course the mock does
 * consider completable. Both halves are real; neither is faked.
 */

export const ENTITY_PASSWORD = 'a-sufficiently-long-password';

/** Unique per process, so a run never collides with dev data or another run. */
const RUN_ID = randomBytes(4).toString('hex');

export interface SeededEntity {
  entityId: string;
  entityName: string;
  email: string;
  /** A course this entity owns which the mock LMS considers completable. */
  borrowedCourse: { id: string; title: string; moodleCourseId: number };
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
 * Argon2 is what the API hashes with, and hashing here would mean importing the
 * API's native module into the Playwright process. Signing in through the real
 * form is the point of these tests, so the account needs a usable password —
 * this is the one hash the fixture creates, using the same helper the API does.
 */
async function hash(password: string): Promise<string> {
  const { hashPassword } = (await import('../../api/src/common/password')) as {
    hashPassword: (value: string) => Promise<string>;
  };

  return hashPassword(password);
}

export async function seedEntity(label: string): Promise<SeededEntity> {
  return withClient(async (client) => {
    const entityName = `جهة الاختبار ${label}`;

    const entity = await client.query<{ id: string }>(
      `INSERT INTO entities (id, key, name, contact_name, contact_email, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'إدارة البرامج', 'contact@authority.example', 'ACTIVE', now(), now())
       RETURNING id`,
      [`pw-entity-${RUN_ID}-${label}`, entityName],
    );

    const entityId = entity.rows[0]!.id;
    const email = `pw-entity-${RUN_ID}-${label}@ministry.gov.example`;

    await client.query(
      `INSERT INTO users
         (id, email, password_hash, full_name, employee_id, department, role, entity_id,
          status, email_verified_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'مسؤول الجهة', $3, 'قسم البرامج', 'ENTITY', $4,
               'ACTIVE', now(), now(), now())`,
      [email, await hash(ENTITY_PASSWORD), `PWE-${RUN_ID}-${label}`.slice(0, 20), entityId],
    );

    /*
     * The borrowed course, chosen from the *end* of the catalogue and from no
     * path the learner journey builds against, so lending it out cannot change
     * what another spec sees. Ownership is restored in `releaseEntity`.
     */
    const course = await client.query<{ id: string; title: string; moodle_course_id: number }>(
      `UPDATE courses SET owner_entity_id = $1
        WHERE moodle_course_id = (
          SELECT MAX(moodle_course_id) FROM courses WHERE owner_entity_id IS NULL
        )
      RETURNING id, title, moodle_course_id`,
      [entityId],
    );

    const borrowed = course.rows[0];
    if (!borrowed) throw new Error('No unowned course to lend to the test entity.');

    return {
      entityId,
      entityName,
      email,
      borrowedCourse: {
        id: borrowed.id,
        title: borrowed.title,
        moodleCourseId: borrowed.moodle_course_id,
      },
    };
  });
}

/**
 * Returns the borrowed course to the catalogue and removes the test entity.
 *
 * The publication state is restored explicitly rather than assumed: the suite
 * unpublishes and re-publishes the course, and leaving it withdrawn would take a
 * catalogue entry away from every later run against this database.
 */
export async function releaseEntity(entity: SeededEntity): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `UPDATE courses
          SET owner_entity_id = NULL, publication = 'PUBLISHED', status = 'AVAILABLE'
        WHERE id = $1`,
      [entity.borrowedCourse.id],
    );

    /* Courses the suite created through the UI: they exist only in this run, and
       leaving drafts behind would slowly fill the catalogue with test data. */
    await client.query(
      `DELETE FROM path_courses WHERE course_id IN
         (SELECT id FROM courses WHERE owner_entity_id = $1)`,
      [entity.entityId],
    );
    await client.query('DELETE FROM courses WHERE owner_entity_id = $1', [entity.entityId]);

    await client.query(
      `DELETE FROM audit_log WHERE actor_user_id IN
         (SELECT id FROM users WHERE entity_id = $1)`,
      [entity.entityId],
    );
    await client.query('DELETE FROM users WHERE entity_id = $1', [entity.entityId]);
    await client.query('DELETE FROM entities WHERE id = $1', [entity.entityId]);
  });
}

/** Puts a learner on the borrowed course, so the review screen has a row. */
export async function enrolLearnerOnCourse(email: string, courseId: string): Promise<void> {
  await withClient(async (client) => {
    const learner = await client.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      email,
    ]);
    const userId = learner.rows[0]?.id;
    if (!userId) throw new Error(`No learner found for ${email}`);

    const path = await client.query<{ id: string }>(
      'SELECT id FROM user_paths WHERE user_id = $1',
      [userId],
    );
    const userPathId = path.rows[0]?.id;
    if (!userPathId) throw new Error(`${email} has no path — confirm one first`);

    await client.query(
      `INSERT INTO user_path_courses
         (id, user_path_id, course_id, display_order, status, grade_percent, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 99, 'IN_PROGRESS', NULL, now(), now())
       ON CONFLICT (user_path_id, course_id) DO NOTHING`,
      [userPathId, courseId],
    );
  });
}
