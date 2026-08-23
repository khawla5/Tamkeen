import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

/* The same root `.env` the API reads. Jest starts its own process per worker and
   inherits nothing from a running server. */
loadEnv({ path: ['../../.env'], quiet: true });

/**
 * Serialises the two suites that share the one live assessment.
 *
 * **Why this exists.** Every other integration suite namespaces its rows by a
 * per-run id, so they run in parallel against one database without seeing each
 * other. The assessment cannot be namespaced: §4.3 has *one* instrument, and
 * `getActive` finds the one ACTIVE row — there is deliberately no second one to
 * give a test.
 *
 * So when `admin-assessment.e2e-spec.ts` publishes a new version while
 * `journey.e2e-spec.ts` is part way through taking the old one, the journey
 * submission is refused with `ASSESSMENT_NOT_FOUND`. **That refusal is correct
 * product behaviour** — a taker whose instrument was replaced mid-attempt must
 * not be scored against a bank they never saw (D-069) — and it is precisely
 * what the assessment service's `status: 'ACTIVE'` filter is for. The collision
 * is an artefact of two suites sharing a database, not a defect to paper over,
 * so the fix serialises the suites rather than weakening either assertion.
 *
 * A Postgres advisory lock on its own connection, rather than a flag or a sleep:
 * it is held for exactly as long as the connection lives, and it is released by
 * the server if a worker dies part way through — which a lock table would not
 * be, and a stuck lock would fail every future run rather than one.
 */

/** Phase 5, sub-phase 3. Any constant will do; this one is greppable. */
const LOCK_KEY = 50_003;

export class AssessmentLock {
  private client: Client | null = null;

  /** Blocks until the other suite has finished with the assessment. */
  async acquire(): Promise<void> {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    /* Session-scoped, so it must be taken on a connection this class keeps —
       Prisma's pool would hand the unlock to a different one. */
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    this.client = client;
  }

  async release(): Promise<void> {
    const client = this.client;
    if (!client) return;

    this.client = null;

    try {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    } finally {
      /* Ending the connection releases the lock regardless, which is the
         property that makes a crashed worker harmless. */
      await client.end();
    }
  }
}
