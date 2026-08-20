import type { PrismaService } from '../prisma/prisma.service';
import type { SaveCvDto } from './cv.dto';
import { CvService } from './cv.service';

/**
 * The CV's pre-fill, which is the feature (§4.11, D-050).
 *
 * "Pre-fills everything the system knows so the user never retypes it" is a
 * product promise, so most of these tests are about what arrives *without*
 * anyone typing. The rest are about the boundary that makes it trustworthy:
 * the certifications section is a read of `certificates`, not a field, so
 * nothing a learner sends can add to it.
 */

const USER = {
  fullName: 'عبدالله بن محمد الدماطي',
  department: 'إدارة الموارد البشرية',
  email: 'abdullah@ministry.gov.example',
};

interface Options {
  stored?: Record<string, unknown> | null;
  certificates?: Array<{
    id: string;
    type: 'COURSE' | 'PATH';
    subjectTitle: string;
    issuedAt: Date;
  }>;
  result?: { code: string } | null;
  userPath?: {
    status: string;
    confirmedAt: Date | null;
    path: { name: string };
  } | null;
  userMissing?: boolean;
}

function harness(options: Options = {}) {
  const upserts: Array<{ create: unknown; update: unknown }> = [];
  let stored = options.stored ?? null;

  const prisma = {
    user: {
      findUnique: () => Promise.resolve(options.userMissing ? null : USER),
    },
    cvProfile: {
      findUnique: () => Promise.resolve(stored),
      upsert: (args: { create: unknown; update: Record<string, unknown> }) => {
        upserts.push({ create: args.create, update: args.update });
        stored = { ...args.update, updatedAt: new Date('2026-08-20T10:00:00.000Z') };
        return Promise.resolve(stored);
      },
    },
    certificate: {
      findMany: () => Promise.resolve(options.certificates ?? []),
    },
    assessmentResult: {
      findFirst: () => Promise.resolve(options.result ?? null),
    },
    userPath: {
      findUnique: () => Promise.resolve(options.userPath ?? null),
    },
  } as unknown as PrismaService;

  return { service: new CvService(prisma), upserts };
}

const CERTIFICATES = [
  {
    id: 'cert-path',
    type: 'PATH' as const,
    subjectTitle: 'مسار القيادة الإدارية',
    issuedAt: new Date('2026-08-18T09:00:00.000Z'),
  },
  {
    id: 'cert-course',
    type: 'COURSE' as const,
    subjectTitle: 'أساسيات القيادة الإدارية',
    issuedAt: new Date('2026-08-10T09:00:00.000Z'),
  },
];

const SAVE: SaveCvDto = {
  fullName: 'Abdullah Al-Damati',
  jobTitle: 'Training Officer',
  department: 'إدارة الموارد البشرية',
  email: 'abdullah@ministry.gov.example',
  phone: '',
  summary: 'Training officer with seven years in the public sector.',
  experience: [],
  education: [],
  skills: ['Curriculum design'],
  externalCertifications: [],
  showCareerProfile: true,
};

describe('CvService', () => {
  describe('a learner who has never saved', () => {
    it('gets a document rather than an empty form', async () => {
      /* §4.11: the first screen is where "never retypes it" has to be true. */
      const { service } = harness();

      const view = await service.get('user-1');

      expect(view.savedAt).toBeNull();
      expect(view.profile.fullName).toBe(USER.fullName);
      expect(view.profile.department).toBe(USER.department);
      expect(view.profile.email).toBe(USER.email);
    });

    it('starts with the career-profile line switched on', async () => {
      /* It is the distinctive part of this CV; a learner who does not want it
         turns it off (§4.11). */
      const { service } = harness();

      expect((await service.get('user-1')).profile.showCareerProfile).toBe(true);
    });

    it('already lists their certificates', async () => {
      const { service } = harness({ certificates: CERTIFICATES });

      const view = await service.get('user-1');

      expect(view.autofill.certifications).toEqual([
        {
          certificateId: 'cert-path',
          type: 'PATH',
          title: 'مسار القيادة الإدارية',
          issuedAt: '2026-08-18T09:00:00.000Z',
        },
        {
          certificateId: 'cert-course',
          type: 'COURSE',
          title: 'أساسيات القيادة الإدارية',
          issuedAt: '2026-08-10T09:00:00.000Z',
        },
      ]);
    });

    it('refuses for a user who does not exist', async () => {
      const { service } = harness({ userMissing: true });

      await expect(service.get('nobody')).rejects.toThrow('USER_NOT_FOUND');
    });
  });

  describe('the career-profile line', () => {
    it('carries the Holland Code as letters, leaving names to the display layer', async () => {
      /* D-050: RIASEC type names pass through as authored, and the catalogue
         already holds the Arabic ones — so the API sends letters (D-034). */
      const { service } = harness({
        result: { code: 'SIE' },
        userPath: { status: 'ACTIVE', confirmedAt: new Date(), path: { name: 'مسار القيادة' } },
      });

      const view = await service.get('user-1');

      expect(view.autofill.careerProfile).toEqual({
        pathName: 'مسار القيادة',
        pathCompleted: false,
        hollandCode: ['S', 'I', 'E'],
      });
    });

    it('marks a finished path as completed', async () => {
      const { service } = harness({
        result: { code: 'SIE' },
        userPath: { status: 'COMPLETED', confirmedAt: new Date(), path: { name: 'مسار القيادة' } },
      });

      expect((await service.get('user-1')).autofill.careerProfile?.pathCompleted).toBe(true);
    });

    it('does not name a path that was never committed to', async () => {
      /* A path still being built is not something to put on a CV (D-002). */
      const { service } = harness({
        result: { code: 'SIE' },
        userPath: { status: 'BUILDING', confirmedAt: null, path: { name: 'مسار القيادة' } },
      });

      const careerProfile = (await service.get('user-1')).autofill.careerProfile;

      expect(careerProfile?.pathName).toBeNull();
      expect(careerProfile?.hollandCode).toEqual(['S', 'I', 'E']);
    });

    it('is absent before the assessment, rather than empty', async () => {
      const { service } = harness({ result: null });

      expect((await service.get('user-1')).autofill.careerProfile).toBeNull();
    });
  });

  describe('saving', () => {
    it('keeps what the learner authored', async () => {
      const { service } = harness();

      const view = await service.save('user-1', SAVE);

      expect(view.profile.fullName).toBe('Abdullah Al-Damati');
      expect(view.profile.jobTitle).toBe('Training Officer');
      expect(view.profile.skills).toEqual(['Curriculum design']);
      expect(view.savedAt).toBe('2026-08-20T10:00:00.000Z');
    });

    it('lets an English name override the Arabic one on the account', async () => {
      /* D-050 — a learner writing an English CV may want a Latin form of a name
         the ministry holds in Arabic. The account is not changed. */
      const { service } = harness();

      const view = await service.save('user-1', SAVE);

      expect(view.profile.fullName).toBe('Abdullah Al-Damati');
      expect(view.autofill.accountFullName).toBe(USER.fullName);
    });

    it('writes none of the system-known fields into the row', async () => {
      /*
       * The boundary that makes the certifications section trustworthy. If any
       * of this were stored, a CV could outlive the record it was drawn from —
       * claiming a certificate its holder no longer has.
       */
      const { service, upserts } = harness({ certificates: CERTIFICATES, result: { code: 'SIE' } });

      await service.save('user-1', SAVE);

      const written = JSON.stringify(upserts[0]);

      expect(written).not.toContain('certifications":[{');
      expect(written).not.toContain('cert-path');
      expect(written).not.toContain('careerProfile');
      expect(written).not.toContain('SIE');
    });

    it('re-reads the certificates on every load rather than the saved copy', async () => {
      /* A certificate issued after the last save has to appear without the
         learner re-saving. */
      const { service } = harness({ certificates: [] });

      await service.save('user-1', SAVE);

      const later = harness({
        certificates: CERTIFICATES,
        stored: {
          ...SAVE,
          updatedAt: new Date('2026-08-20T10:00:00.000Z'),
        },
      });

      expect((await later.service.get('user-1')).autofill.certifications).toHaveLength(2);
    });

    it('round-trips a saved document unchanged', async () => {
      const { service } = harness();

      await service.save('user-1', SAVE);
      const reloaded = await service.get('user-1');

      expect(reloaded.profile).toMatchObject({
        fullName: SAVE.fullName,
        jobTitle: SAVE.jobTitle,
        summary: SAVE.summary,
        showCareerProfile: true,
      });
    });
  });
});
