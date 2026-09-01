import { randomBytes } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';

import { hashPassword } from '../src/common/password';
import { MockLmsService } from '../src/moodle/mock/mock-lms.service';
import { seedProductData } from '../src/seed-data/seed-runner';
import type { LmsPort } from '../src/moodle/lms.port';
import { PrismaClient, UserRole, UserStatus } from '../generated/prisma';

loadEnv({ path: ['../../.env', '.env'], quiet: true });

/**
 * Seeds the one account the system cannot bootstrap without: a super-admin,
 * then the Phase 1 product data — the assessment bank, the course catalogue
 * mirrored from the LMS, the paths and their membership.
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

/**
 * The LMS the catalogue is seeded from.
 *
 * Resolved the same way `MoodleModule` resolves it, and refusing `real` for the
 * same reason the module does: the Phase 2 adapter is a stub, and seeding
 * against it would produce an empty catalogue that looks like a successful run.
 */
function resolveLms(): LmsPort {
  if ((process.env.MOODLE_MODE ?? 'mock') === 'real') {
    throw new Error(
      'MOODLE_MODE=real: catalogue seeding needs the Phase 2 Moodle adapter, which is not implemented. ' +
        'Seed with MOODLE_MODE=mock, or wait for the Phase 2 catalogue sync.',
    );
  }

  return new MockLmsService();
}

async function seedSuperAdmin(): Promise<void> {
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

/**
 * A demonstration entity and one account for it (§4B, D-063).
 *
 * **This is a seam for Phase 5, not a substitute for it.** Creating entity
 * accounts properly belongs to the super-admin portal (§4C.2); until that
 * exists, the entity portal would be untestable — there would be no way to sign
 * in as an entity at all. So the seed creates one, under exactly the discipline
 * `seedSuperAdmin` already established: no known default password, generated and
 * printed once in development, refused outright in production unless supplied.
 *
 * It also assigns ownership of a **subset** of the seeded catalogue to that
 * entity, deliberately leaving the rest ownerless (D-063). An entity that owned
 * everything would make a scoping bug invisible — every query would look correct
 * because there is nothing it should have been excluding. The unowned remainder
 * is what gives the scoping tests something real to fail against.
 */
async function seedDemoEntity(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  const supplied = process.env.SEED_ENTITY_PASSWORD;

  if (isProduction && !supplied) {
    console.log('NODE_ENV=production without SEED_ENTITY_PASSWORD — skipping the demo entity.');
    return;
  }

  const entity = await prisma.entity.upsert({
    where: { key: 'demo-training-authority' },
    create: {
      key: 'demo-training-authority',
      name: 'الهيئة الوطنية للتدريب',
      contactName: 'إدارة البرامج التدريبية',
      contactEmail: 'training@authority.gov.example',
    },
    update: {},
    select: { id: true, name: true },
  });

  const email = process.env.SEED_ENTITY_EMAIL ?? 'entity@authority.gov.example';
  const password = supplied ?? randomBytes(24).toString('base64url');

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, entityId: true, role: true },
  });

  if (existing) {
    /* As with the super-admin: never touch the password or verification state of
       an account already in use. Only repair the role and the entity link, so a
       re-seed cannot leave an entity account that can sign in but sees nothing. */
    if (existing.role !== UserRole.ENTITY || existing.entityId !== entity.id) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: UserRole.ENTITY, entityId: entity.id },
      });
      console.log(`Repaired entity account ${email}`);
    } else {
      console.log(`Entity account ${email} already exists — nothing to do.`);
    }
  } else {
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        fullName: 'مسؤول الجهة التدريبية',
        employeeId: process.env.SEED_ENTITY_EMPLOYEE_ID ?? 'ENT-0001',
        department: entity.name,
        role: UserRole.ENTITY,
        entityId: entity.id,
        status: UserStatus.ACTIVE,
        /* Provisioned by an operator, not created through the self-registration
           flow that email verification guards. */
        emailVerifiedAt: new Date(),
      },
    });

    console.log(`Created entity account ${email} for ${entity.name}`);

    if (!supplied) {
      console.log('');
      console.log('  ┌─────────────────────────────────────────────────────────────');
      console.log('  │ Generated entity password (shown once, not stored):');
      console.log(`  │   ${password}`);
      console.log('  │ Set SEED_ENTITY_PASSWORD to choose your own instead.');
      console.log('  └─────────────────────────────────────────────────────────────');
      console.log('');
    }
  }

  /* Claim a slice of the catalogue, and only a slice. `moodleCourseId` is stable
     across seeds, so re-running assigns the same courses rather than drifting. */
  const owned = await prisma.course.updateMany({
    where: { moodleCourseId: { in: DEMO_ENTITY_COURSE_IDS }, ownerEntityId: null },
    data: { ownerEntityId: entity.id },
  });

  console.log(
    `Entity ${entity.name} owns ${DEMO_ENTITY_COURSE_IDS.length} courses ` +
      `(${owned.count} newly assigned); the rest stay ownerless for Phase 5.`,
  );
}

/** A deliberately small slice — see `seedDemoEntity`. */
const DEMO_ENTITY_COURSE_IDS = [101, 102, 103, 104, 105, 106, 107, 108];

/**
 * A demonstration employee — the account that walks the learner journey.
 *
 * Same discipline as the other seeded accounts: no known default password
 * (generated and printed once in development, skipped in production unless
 * SEED_STUDENT_PASSWORD is supplied), pre-verified because it is provisioned by
 * an operator rather than through self-registration, and idempotent — a re-seed
 * never touches the password of an account in use, it only repairs the role.
 *
 * No `moodleUserId` is written: the LMS counterpart is provisioned lazily by
 * the enrolment service the first time this account confirms a path, exactly
 * as it is for a self-registered employee.
 */
async function seedDemoStudent(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  const supplied = process.env.SEED_STUDENT_PASSWORD;

  if (isProduction && !supplied) {
    console.log('NODE_ENV=production without SEED_STUDENT_PASSWORD — skipping the demo student.');
    return;
  }

  const email = process.env.SEED_STUDENT_EMAIL ?? 'student@ministry.gov.example';
  const password = supplied ?? randomBytes(24).toString('base64url');

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });

  if (existing) {
    if (existing.role !== UserRole.EMPLOYEE) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: UserRole.EMPLOYEE },
      });
      console.log(`Repaired student account ${email}`);
    } else {
      console.log(`Student account ${email} already exists — nothing to do.`);
    }
    return;
  }

  await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      fullName: 'طالب تجريبي',
      employeeId: process.env.SEED_STUDENT_EMPLOYEE_ID ?? 'EMP-1001',
      department: 'تقنية المعلومات',
      role: UserRole.EMPLOYEE,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });

  console.log(`Created student account ${email}`);

  if (!supplied) {
    console.log('');
    console.log('  ┌─────────────────────────────────────────────────────────────');
    console.log('  │ Generated student password (shown once, not stored):');
    console.log(`  │   ${password}`);
    console.log('  │ Set SEED_STUDENT_PASSWORD to choose your own instead.');
    console.log('  └─────────────────────────────────────────────────────────────');
    console.log('');
  }
}

async function main(): Promise<void> {
  await seedSuperAdmin();

  const counts = await seedProductData(prisma, resolveLms());

  console.log(
    `Seeded ${counts.questions} questions (${counts.options} options), ` +
      `${counts.englishQuestions} English placement questions, ` +
      `${counts.courses} courses, ${counts.paths} paths, ${counts.pathCourses} memberships.`,
  );

  /* After the catalogue, because it claims courses the catalogue seed creates. */
  await seedDemoEntity();

  await seedDemoStudent();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
