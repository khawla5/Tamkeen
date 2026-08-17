import { randomBytes } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';

import { hashPassword } from '../src/common/password';
import { PrismaClient, UserRole, UserStatus } from '../generated/prisma';

loadEnv({ path: ['../../.env', '.env'], quiet: true });

/**
 * Seeds the one account the system cannot bootstrap without: a super-admin.
 *
 * Two properties matter more than convenience here.
 *
 * 1. **No known default password.** A seeded `admin/admin` is how internal
 *    government systems get breached. In production the password must be
 *    supplied explicitly via SEED_SUPER_ADMIN_PASSWORD or the seed refuses to
 *    run. In development, a random one is generated and printed once — it exists
 *    nowhere else, so it cannot be guessed from the repository.
 *
 * 2. **Idempotent.** Re-running never overwrites an existing account's password
 *    or re-verifies its email. Seeds get run twice; that must be harmless.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set — cannot seed.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

interface SeedConfig {
  email: string;
  fullName: string;
  employeeId: string;
  department: string;
  password: string;
  generated: boolean;
}

function resolveConfig(): SeedConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const supplied = process.env.SEED_SUPER_ADMIN_PASSWORD;

  if (isProduction && !supplied) {
    throw new Error(
      'SEED_SUPER_ADMIN_PASSWORD must be set explicitly when NODE_ENV=production. ' +
        'Refusing to create a privileged account with a generated password that would ' +
        'be printed to the deployment log.',
    );
  }

  return {
    email: process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@ministry.gov.example',
    fullName: process.env.SEED_SUPER_ADMIN_NAME ?? 'مدير النظام',
    employeeId: process.env.SEED_SUPER_ADMIN_EMPLOYEE_ID ?? 'ADMIN-0001',
    department: process.env.SEED_SUPER_ADMIN_DEPARTMENT ?? 'إدارة النظام',
    /* 32 random bytes as base64url — comfortably beyond guessing. */
    password: supplied ?? randomBytes(24).toString('base64url'),
    generated: !supplied,
  };
}

async function main(): Promise<void> {
  const config = resolveConfig();

  const existing = await prisma.user.findUnique({
    where: { email: config.email },
    select: { id: true, role: true },
  });

  if (existing) {
    /* Do not touch the password or verification state of an account that is
       already in use. Only ensure the role is still SUPER_ADMIN, so a seed run
       cannot silently leave the system with no administrator. */
    if (existing.role !== UserRole.SUPER_ADMIN) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: UserRole.SUPER_ADMIN },
      });
      console.log(`Restored SUPER_ADMIN role on existing account ${config.email}`);
    } else {
      console.log(`Super-admin ${config.email} already exists — nothing to do.`);
    }
    return;
  }

  const user = await prisma.user.create({
    data: {
      email: config.email,
      passwordHash: await hashPassword(config.password),
      fullName: config.fullName,
      employeeId: config.employeeId,
      department: config.department,
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      /* Pre-verified: this account is provisioned by an operator, not created
         through the self-registration flow that email verification guards. */
      emailVerifiedAt: new Date(),
    },
    select: { id: true, email: true },
  });

  console.log(`Created super-admin ${user.email}`);

  if (config.generated) {
    console.log('');
    console.log('  ┌─────────────────────────────────────────────────────────────');
    console.log('  │ Generated super-admin password (shown once, not stored):');
    console.log(`  │   ${config.password}`);
    console.log('  │ Sign in and change it. Set SEED_SUPER_ADMIN_PASSWORD to');
    console.log('  │ choose your own instead.');
    console.log('  └─────────────────────────────────────────────────────────────');
    console.log('');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
