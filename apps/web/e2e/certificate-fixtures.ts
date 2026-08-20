import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

/* The Playwright runner is its own process and does not inherit the API's
   configuration, so the connection string is loaded here. Same file, same
   database the running API is using. */
loadEnv({ path: ['../../.env'], quiet: true });

/**
 * Puts a certificate in front of a learner, so the browser suite can exercise
 * the screens that only exist once one has been earned.
 *
 * **Why this is seeded rather than earned in the browser.** Issuance is driven
 * only by completions the sync job wrote from the LMS (§2), and there is no way
 * to make the mock LMS report a pass over HTTP — deliberately, because the
 * alternative is shipping a test-only endpoint that manufactures completions
 * into a government system. Making a test easier is not worth that.
 *
 * So the layers split by what each can actually prove:
 *
 *  - **pass → certificate** is proven by the issuance unit suite and by
 *    `spike/pdf/verify-issuance.ts`, which runs the real service against real
 *    PostgreSQL and a real Chromium.
 *  - **certificate → gallery → download → verification page** is proven here,
 *    in a real browser, which is the part a unit test cannot reach.
 *  - **real rendering in the deployed shape** is proven by the CV export in the
 *    same browser run: it needs no seeding, and it goes through the running
 *    API's own Chromium.
 */

/** The absolute path the Playwright config pins the API's storage root to. */
const STORAGE_ROOT = resolve('..', '..', '.storage', 'certificates');

/** A minimal, genuinely valid PDF — enough for the download path to be real. */
const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF\n',
  'latin1',
);

export interface SeededCertificate {
  verificationId: string;
  subjectTitle: string;
  holderName: string;
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
 * Records a passing completion for the learner's first chosen course and issues
 * the certificate that would follow it.
 *
 * The completion row is written the way the sync job writes it — same shape,
 * same `passThresholdUsed` — so the state the browser then sees is the state a
 * real pass produces.
 */
export async function seedPassedCourseCertificate(email: string): Promise<SeededCertificate> {
  return withClient(async (client) => {
    const learner = await client.query<{ id: string; full_name: string }>(
      'SELECT id, full_name FROM users WHERE email = $1',
      [email],
    );
    const user = learner.rows[0];
    if (!user) throw new Error(`No learner found for ${email}`);

    const course = await client.query<{ id: string; title: string; moodle_course_id: number }>(
      `SELECT c.id, c.title, c.moodle_course_id
         FROM user_path_courses upc
         JOIN user_paths up ON up.id = upc.user_path_id
         JOIN courses c ON c.id = upc.course_id
        WHERE up.user_id = $1
        ORDER BY upc.display_order ASC
        LIMIT 1`,
      [user.id],
    );
    const chosen = course.rows[0];
    if (!chosen) throw new Error(`${email} has no chosen courses — confirm a path first`);

    await client.query(
      `INSERT INTO completions
         (id, user_id, moodle_course_id, completed, completed_at, grade_percent, passed,
          pass_threshold_used, synced_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, true, now(), 88, true, 70, now(), now(), now())
       ON CONFLICT (user_id, moodle_course_id) DO UPDATE
         SET passed = true, completed = true, grade_percent = 88`,
      [user.id, chosen.moodle_course_id],
    );

    /* Mirrored onto the chosen course exactly as the sync would, so My Path and
       the dashboard show a finished course rather than an untouched one. */
    await client.query(
      `UPDATE user_path_courses SET status = 'COMPLETED', grade_percent = 88, completed_at = now()
        WHERE course_id = $1
          AND user_path_id IN (SELECT id FROM user_paths WHERE user_id = $2)`,
      [chosen.id, user.id],
    );

    const id = randomUUID();
    const verificationId = randomBytes(32).toString('base64url');
    const pdfPath = `${new Date().getUTCFullYear()}/${id}.pdf`;

    const absolute = join(STORAGE_ROOT, pdfPath);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, PDF_BYTES);

    await client.query(
      `INSERT INTO certificates
         (id, user_id, type, course_id, path_id, verification_id, pdf_path, pdf_sha256, pdf_bytes,
          holder_name, subject_title, issued_at, created_at, updated_at)
       VALUES ($1, $2, 'COURSE', $3, NULL, $4, $5, $6, $7, $8, $9, now(), now(), now())`,
      [
        id,
        user.id,
        chosen.id,
        verificationId,
        pdfPath,
        createHash('sha256').update(PDF_BYTES).digest('hex'),
        PDF_BYTES.byteLength,
        user.full_name,
        chosen.title,
      ],
    );

    /* The in-app indicator the issuance path also writes (§2). */
    await client.query(
      `INSERT INTO notifications (id, user_id, type, related_id, created_at)
       VALUES (gen_random_uuid(), $1, 'CERTIFICATE_ISSUED', $2, now())`,
      [user.id, id],
    );

    return { verificationId, subjectTitle: chosen.title, holderName: user.full_name };
  });
}
