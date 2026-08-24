import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

/* The same root `.env` the API reads. Jest starts its own process per worker and
   inherits nothing from a running server. */
loadEnv({ path: ['../../.env'], quiet: true });

/**
 * Serialises the suites that mutate product state no test can namespace.
 *
 * **Why this exists.** Every integration suite namespaces the rows it creates by
 * a per-run id, so they run in parallel against one database without seeing each
 * other. Two things resist that:
 *
 *  - **The assessment.** §4.3 has *one* instrument and `getActive` finds the one
 *    ACTIVE row; a partial unique index means there is deliberately no second one
 *    to hand a test. Publishing a version mid-run makes another suite's
 *    submission fail with `ASSESSMENT_NOT_FOUND`.
 *  - **The catalogue of paths.** §4C.4 creates and offers a path, which is
 *    globally visible the moment it is active — so a suite reading "every path a
 *    learner is offered" sees one that was not there when it started.
 *
 * **Neither collision is a defect to paper over.** A taker whose instrument was
 * replaced mid-attempt must be refused rather than mis-scored (D-069), and a
 * newly offered path *should* appear to everyone. Both are the product working.
 * The artefact is two suites sharing one database, so the fix serialises the
 * suites rather than weakening any assertion.
 *
 * A Postgres advisory lock on its own connection, rather than a flag or a sleep:
 * it is held for exactly as long as the connection lives, and the server
 * releases it if a worker dies part way through — which a lock *table* would not
 * be, and a stuck row would fail every future run rather than one.
 *
 * **Adding a suite here is a cost, so weigh it.** Each one lengthens the serial
 * band. Take the lock only when the suite writes something globally visible that
 * another suite reads: an admin sub-phase that only touches its own rows does
 * not need it.
 */

/** One key for all of them: the contended resources overlap. */
const LOCK_KEY = 50_003;

export class SharedStateLock {
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
