import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI configuration (Prisma 7).
 *
 * Prisma 7 moved the datasource URL out of schema.prisma and stopped loading
 * .env automatically, so both are handled explicitly here. The root .env is
 * loaded so one file serves both apps in local development, matching the
 * envFilePath used by the Nest config module.
 */
loadEnv({ path: ['../../.env', '.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    /*
     * Deliberately not prisma's `env()` helper, which throws when the variable
     * is absent. `prisma generate` needs no database, and it runs on postinstall
     * — so a fresh clone without a .env must still install successfully. The
     * placeholder is worded so that if a command that *does* need the database
     * runs without configuration, the connection error names the missing
     * variable instead of being cryptic.
     */
    url: process.env.DATABASE_URL ?? 'postgresql://DATABASE_URL-is-not-set',
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
