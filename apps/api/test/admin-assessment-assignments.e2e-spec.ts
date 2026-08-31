import { randomBytes } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { AdminAssessmentAssignmentRow, AdminAssessmentGroupRow } from '@tamkeen/types';

import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/password';
import { EmailService } from '../src/email/email.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * §4C.3's Assignments tab (TAM-147) — assigning a typed instrument, or a
 * named group of them, to everyone, a department or a person.
 *
 * Exercises the CRUD surface directly, over real HTTP against a real
 * database: an assignment names either key space, the pairing between scope
 * and target is enforced, and a group in active use cannot be deleted out
 * from under the assignment naming it.
 */

class EmailCapture {
  sendEmailVerification(): Promise<void> {
    return Promise.resolve();
  }
  sendPasswordReset(): Promise<void> {
    return Promise.resolve();
  }
  sendInvitation(): Promise<void> {
    return Promise.resolve();
  }
}

const PASSWORD = 'a-sufficiently-long-password';
const RUN_ID = randomBytes(4).toString('hex');

describe('Admin assessment assignments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sessionAdmin: string;
  let csrfCookie: string;
  let csrfToken: string;
  let targetUserId: string;

  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'false';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue(new EmailCapture())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    const issued = await csrf();
    csrfCookie = issued.cookie;
    csrfToken = issued.token;

    await account('admin', 'SUPER_ADMIN');
    sessionAdmin = await signIn(`aasgn-${RUN_ID}-admin@ministry.gov.example`);

    const target = await account('target', 'EMPLOYEE');
    targetUserId = target.id;
  }, 120_000);

  afterAll(async () => {
    await prisma.assessmentAssignment.deleteMany({
      where: { assessmentKey: { startsWith: `aasgn-${RUN_ID}-` } },
    });
    /* This suite also names two *real* instrument keys directly (`riasec-core`,
       `english-cefr`) to prove the resolver handles a real key, not just its
       own namespaced fixtures — so the `startsWith` sweep above cannot catch
       those rows. Each is cleaned up by the test that creates it, except the
       DEPARTMENT one, which the suite keeps around across several tests; swept
       here by its run-scoped target instead. */
    await prisma.assessmentAssignment.deleteMany({ where: { target: departmentTarget() } });
    await prisma.assessmentGroup.deleteMany({ where: { key: { startsWith: `aasgn-${RUN_ID}-` } } });

    const created = await prisma.user.findMany({
      where: { email: { startsWith: `aasgn-${RUN_ID}-` } },
      select: { id: true },
    });
    const ids = created.map((user) => user.id);

    if (ids.length > 0) {
      await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
      await prisma.session.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }

    await app.close();
  }, 60_000);

  const server = () => app.getHttpServer() as unknown as App;

  async function csrf(): Promise<{ cookie: string; token: string }> {
    const response = await request(server()).get('/api/auth/csrf').expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];

    return {
      cookie: cookies.map((value) => value.split(';')[0]).join('; '),
      token: (response.body as { csrfToken: string }).csrfToken,
    };
  }

  function send(
    method: 'post' | 'patch' | 'delete' | 'put',
    path: string,
    body: Record<string, unknown> = {},
    session?: string,
  ) {
    const agent = request(server());

    return agent[method](path)
      .set('Cookie', [csrfCookie, ...(session ? [session] : [])].join('; '))
      .set('X-CSRF-Token', csrfToken)
      .send(body);
  }

  const get = (path: string, session: string) => request(server()).get(path).set('Cookie', session);

  async function signIn(email: string): Promise<string> {
    const response = await send('post', '/api/auth/login', { email, password: PASSWORD }).expect(
      200,
    );
    const cookies = response.headers['set-cookie'] as unknown as string[];

    return cookies.find((value) => value.startsWith('tamkeen_session='))!.split(';')[0]!;
  }

  async function account(label: string, role: 'SUPER_ADMIN' | 'EMPLOYEE'): Promise<{ id: string }> {
    return prisma.user.create({
      data: {
        email: `aasgn-${RUN_ID}-${label}@ministry.gov.example`,
        passwordHash: await hashPassword(PASSWORD),
        fullName: label === 'target' ? 'موظف مستهدف' : 'حساب تجريبي',
        employeeId: `S-${RUN_ID}-${label}`.slice(0, 20),
        department: 'قسم الاختبار',
        role,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
  }

  const departmentTarget = () => `قسم الاختبار ${RUN_ID}`;

  const listAssignments = async () =>
    (await get('/api/admin/assessment-assignments', sessionAdmin).expect(200))
      .body as AdminAssessmentAssignmentRow[];

  const listGroups = async () =>
    (await get('/api/admin/assessment-groups', sessionAdmin).expect(200))
      .body as AdminAssessmentGroupRow[];

  describe('assigning an instrument', () => {
    it('refuses a key that resolves to neither an instrument nor a group', async () => {
      await send(
        'post',
        '/api/admin/assessment-assignments',
        { assessmentKey: `aasgn-${RUN_ID}-nothing`, scope: 'ALL', required: true, displayOrder: 1 },
        sessionAdmin,
      ).expect(404);
    });

    it('refuses ALL with a target', async () => {
      await send(
        'post',
        '/api/admin/assessment-assignments',
        {
          assessmentKey: 'riasec-core',
          scope: 'ALL',
          target: 'قسم',
          required: true,
          displayOrder: 1,
        },
        sessionAdmin,
      ).expect(400);
    });

    it('refuses DEPARTMENT with no target', async () => {
      await send(
        'post',
        '/api/admin/assessment-assignments',
        { assessmentKey: 'riasec-core', scope: 'DEPARTMENT', required: true, displayOrder: 1 },
        sessionAdmin,
      ).expect(400);
    });

    it('refuses USER scope naming an account that does not exist', async () => {
      await send(
        'post',
        '/api/admin/assessment-assignments',
        {
          assessmentKey: 'riasec-core',
          scope: 'USER',
          target: '00000000-0000-0000-0000-000000000000',
          required: true,
          displayOrder: 1,
        },
        sessionAdmin,
      ).expect(404);
    });

    it('creates a DEPARTMENT assignment naming a real instrument, and resolves its title', async () => {
      const rows = (
        await send(
          'post',
          '/api/admin/assessment-assignments',
          {
            assessmentKey: 'english-cefr',
            scope: 'DEPARTMENT',
            target: departmentTarget(),
            required: false,
            displayOrder: 5,
          },
          sessionAdmin,
        ).expect(201)
      ).body as AdminAssessmentAssignmentRow[];

      const row = rows.find(
        (candidate) => candidate.assessmentKey === 'english-cefr' && candidate.target === departmentTarget(),
      );
      expect(row).toMatchObject({ resolvedKind: 'INSTRUMENT', scope: 'DEPARTMENT', required: false });
      expect(row?.resolvedTitle).toBeTruthy();
    });

    it('creates a USER assignment and resolves the account name as the label', async () => {
      const rows = (
        await send(
          'post',
          '/api/admin/assessment-assignments',
          {
            assessmentKey: 'riasec-core',
            scope: 'USER',
            target: targetUserId,
            required: true,
            displayOrder: 2,
          },
          sessionAdmin,
        ).expect(201)
      ).body as AdminAssessmentAssignmentRow[];

      const row = rows.find((candidate) => candidate.target === targetUserId);
      expect(row).toMatchObject({ scope: 'USER', targetLabel: 'موظف مستهدف' });
    });

    it('audits the assignment', async () => {
      const entry = await prisma.auditLog.findFirst({
        where: { action: 'ADMIN_ASSESSMENT_ASSIGNED', outcome: 'SUCCESS' },
        orderBy: { occurredAt: 'desc' },
      });
      expect(entry).not.toBeNull();
    });

    it('edits required and displayOrder without touching the scope or key', async () => {
      const rows = await listAssignments();
      const row = rows.find((candidate) => candidate.target === targetUserId)!;

      const updated = (
        await send(
          'patch',
          `/api/admin/assessment-assignments/${row.id}`,
          { required: false, displayOrder: 9 },
          sessionAdmin,
        ).expect(200)
      ).body as AdminAssessmentAssignmentRow[];

      expect(updated.find((candidate) => candidate.id === row.id)).toMatchObject({
        required: false,
        displayOrder: 9,
        assessmentKey: 'riasec-core',
      });
    });

    it('removes an assignment and audits the unassignment', async () => {
      const rows = await listAssignments();
      const row = rows.find((candidate) => candidate.target === targetUserId)!;

      const remaining = (
        await send('delete', `/api/admin/assessment-assignments/${row.id}`, {}, sessionAdmin).expect(
          200,
        )
      ).body as AdminAssessmentAssignmentRow[];

      expect(remaining.find((candidate) => candidate.id === row.id)).toBeUndefined();

      const entry = await prisma.auditLog.findFirst({
        where: { action: 'ADMIN_ASSESSMENT_UNASSIGNED', targetId: row.id },
      });
      expect(entry).not.toBeNull();
    });
  });

  describe('groups', () => {
    const groupKey = () => `aasgn-${RUN_ID}-core`;

    it('refuses an empty group', async () => {
      await send(
        'put',
        '/api/admin/assessment-groups',
        { key: groupKey(), name: 'الحزمة الأساسية', memberKeys: [] },
        sessionAdmin,
      ).expect(400);
    });

    it('creates a group and resolves each member’s title, leaving a stale one blank', async () => {
      const rows = (
        await send(
          'put',
          '/api/admin/assessment-groups',
          {
            key: groupKey(),
            name: 'الحزمة الأساسية',
            memberKeys: ['riasec-core', 'english-cefr', `aasgn-${RUN_ID}-ghost`],
          },
          sessionAdmin,
        ).expect(200)
      ).body as AdminAssessmentGroupRow[];

      const group = rows.find((candidate) => candidate.key === groupKey())!;
      expect(group.memberKeys).toEqual(['riasec-core', 'english-cefr', `aasgn-${RUN_ID}-ghost`]);
      expect(group.memberTitles[0]).toBeTruthy();
      expect(group.memberTitles[1]).toBeTruthy();
      expect(group.memberTitles[2]).toBe('');
    });

    it('edits an existing group in place by its key, rather than creating a second one', async () => {
      const before = await listGroups();
      const beforeCount = before.filter((candidate) => candidate.key === groupKey()).length;
      expect(beforeCount).toBe(1);

      const rows = (
        await send(
          'put',
          '/api/admin/assessment-groups',
          { key: groupKey(), name: 'الحزمة المعدّلة', memberKeys: ['riasec-core'] },
          sessionAdmin,
        ).expect(200)
      ).body as AdminAssessmentGroupRow[];

      const matches = rows.filter((candidate) => candidate.key === groupKey());
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({ name: 'الحزمة المعدّلة', memberKeys: ['riasec-core'] });
    });

    it('audits the group change', async () => {
      const entry = await prisma.auditLog.findFirst({
        where: { action: 'ADMIN_ASSESSMENT_GROUP_CHANGED', outcome: 'SUCCESS' },
        orderBy: { occurredAt: 'desc' },
      });
      expect(entry).not.toBeNull();
    });

    it('refuses to delete a group an assignment still names', async () => {
      const groups = await listGroups();
      const group = groups.find((candidate) => candidate.key === groupKey())!;

      await send(
        'post',
        '/api/admin/assessment-assignments',
        { assessmentKey: groupKey(), scope: 'ALL', required: true, displayOrder: 1 },
        sessionAdmin,
      ).expect(201);

      await send('delete', `/api/admin/assessment-groups/${group.id}`, {}, sessionAdmin).expect(409);
    });

    it('deletes a group nothing assigns any more', async () => {
      const assignments = await listAssignments();
      const naming = assignments.find((candidate) => candidate.assessmentKey === groupKey())!;
      await send(
        'delete',
        `/api/admin/assessment-assignments/${naming.id}`,
        {},
        sessionAdmin,
      ).expect(200);

      const groups = await listGroups();
      const group = groups.find((candidate) => candidate.key === groupKey())!;

      const remaining = (
        await send('delete', `/api/admin/assessment-groups/${group.id}`, {}, sessionAdmin).expect(200)
      ).body as AdminAssessmentGroupRow[];

      expect(remaining.find((candidate) => candidate.id === group.id)).toBeUndefined();
    });
  });

  it('is closed to anyone who is not a super admin', async () => {
    await get('/api/admin/assessment-assignments', '').expect(401);
  });
});
