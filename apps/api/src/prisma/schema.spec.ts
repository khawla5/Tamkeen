import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { COURSE_STATUSES, PATH_STATUSES, USER_PATH_STATUSES, USER_ROLES } from '@tamkeen/types';

/**
 * Guards the Prisma schema against drift from the shared types and from the
 * product rules in CLAUDE.md §6.
 *
 * The schema text is parsed rather than the generated client imported, so these
 * assertions hold even before `prisma generate` has run — no CI ordering trap.
 */
const SCHEMA = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');

function enumValues(name: string): string[] {
  const match = new RegExp(`enum\\s+${name}\\s*\\{([^}]*)\\}`).exec(SCHEMA);
  if (!match) {
    throw new Error(`enum ${name} not found in schema.prisma`);
  }

  return match[1]!
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => line.length > 0);
}

function modelBody(name: string): string {
  const match = new RegExp(`model\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(SCHEMA);
  if (!match) {
    throw new Error(`model ${name} not found in schema.prisma`);
  }
  return match[1]!;
}

describe('Prisma schema', () => {
  it('keeps UserRole in lockstep with USER_ROLES in @tamkeen/types', () => {
    /* If these diverge, the API and the frontend disagree about what a role is,
       and RBAC checks silently stop matching. */
    expect(enumValues('UserRole')).toEqual([...USER_ROLES]);
  });

  it('models exactly the three portals — no extra roles smuggled in', () => {
    expect(enumValues('UserRole')).toHaveLength(3);
  });

  describe('User', () => {
    const user = modelBody('User');

    it('bridges to Moodle by id only, nullable and unique (CLAUDE.md §1)', () => {
      /* Nullable because provisioning is Phase 2; unique so two users can never
         map onto one Moodle account. */
      expect(user).toMatch(/moodleUserId\s+Int\?\s+@unique/);
    });

    it('stores a password hash, never a password', () => {
      expect(user).toMatch(/passwordHash\s+String/);
      expect(user).not.toMatch(/\bpassword\s+String/);
    });

    it('records email verification as a timestamp, so "when" is auditable', () => {
      expect(user).toMatch(/emailVerifiedAt\s+DateTime\?/);
    });

    it('carries brute-force lockout state that survives a restart (§2)', () => {
      expect(user).toMatch(/failedLoginAttempts\s+Int/);
      expect(user).toMatch(/lockedUntil\s+DateTime\?/);
    });

    it('enforces unique email and employee id (the D-017 registration gate)', () => {
      expect(user).toMatch(/email\s+String\s+@unique/);
      expect(user).toMatch(/employeeId\s+String\s+@unique/);
    });
  });

  describe('AuthToken', () => {
    const token = modelBody('AuthToken');

    it('stores only a hash, so a database leak yields no usable links', () => {
      expect(token).toMatch(/tokenHash\s+String\s+@unique/);
      expect(token).not.toMatch(/\btoken\s+String/);
    });

    it('expires, and records consumption so reuse is detectable', () => {
      expect(token).toMatch(/expiresAt\s+DateTime/);
      expect(token).toMatch(/consumedAt\s+DateTime\?/);
    });
  });

  describe('AuditLog', () => {
    const audit = modelBody('AuditLog');

    it('records who, what and when (§2 security baseline)', () => {
      expect(audit).toMatch(/actorUserId\s+String\?/);
      expect(audit).toMatch(/action\s+String/);
      expect(audit).toMatch(/occurredAt\s+DateTime/);
    });

    it('survives actor deletion instead of cascading the trail away', () => {
      /* Deleting a user must not erase the record that they acted. */
      expect(audit).toMatch(/onDelete:\s*SetNull/);
    });

    it('references targets by type and id, carrying no names or emails', () => {
      expect(audit).toMatch(/targetType\s+String\?/);
      expect(audit).toMatch(/targetId\s+String\?/);
      expect(audit).not.toMatch(/(fullName|email|employeeId)/);
    });
  });

  describe('Notification', () => {
    it('stays minimal per §2 — certificate issuance only, for now', () => {
      expect(enumValues('NotificationType')).toEqual(['CERTIFICATE_ISSUED']);
    });

    it('stores no copy, so Arabic wording changes need no data migration', () => {
      expect(modelBody('Notification')).not.toMatch(/(title|body|message)\s+String/);
    });
  });

  describe('Completion (Phase 2)', () => {
    it('is unique on (user, moodle_course_id)', () => {
      /*
       * One constraint carrying three rules: re-running the polled sync cannot
       * duplicate a row (D-005), a course reachable by more than one route
       * reuses the single completion rather than being re-taken (D-003, §2),
       * and Phase 3's certificate issuance gets a stable key to be idempotent
       * against.
       */
      expect(modelBody('Completion')).toMatch(/@@unique\(\[userId, moodleCourseId\]\)/);
    });

    it('keys on the LMS course id, not our catalogue row', () => {
      /* The LMS course is the thing actually completed, and a completion must
         survive our catalogue row being retired or re-created. */
      expect(modelBody('Completion')).toMatch(/moodleCourseId\s+Int/);
    });

    it('records the threshold each verdict was judged against', () => {
      /* Otherwise changing the product setting later makes a historical pass
         unexplainable — which matters when a certificate was issued on it. */
      expect(modelBody('Completion')).toMatch(/passThresholdUsed/);
    });
  });

  describe('scope discipline', () => {
    it('holds nothing the product has retired (D-134)', () => {
      /*
       * The mirror image of the guard this replaces. Every model here was real
       * and is now gone with the model it served: the build flow's per-learner
       * course list, the instrument-assignment gate, and the whole Holland bank.
       * A leftover table is a leftover concept, and the next person to read the
       * schema would implement against it.
       */
      const retiredModels = [
        'UserPathCourse',
        'AssessmentAssignment',
        'AssessmentOptionWeight',
        'EnglishAssessment',
        'EnglishAssessmentResult',
      ];

      const leftovers = retiredModels.filter((model) =>
        new RegExp(`model\\s+${model}\\s*\\{`).test(SCHEMA),
      );

      expect(leftovers).toEqual([]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Phase 1
  // ───────────────────────────────────────────────────────────────────────────

  it('keeps CourseStatus in lockstep with COURSE_STATUSES in @tamkeen/types', () => {
    expect(enumValues('CourseStatus')).toEqual([...COURSE_STATUSES]);
  });

  it('keeps the path status enums in lockstep with the shared types', () => {
    expect(enumValues('UserPathStatus')).toEqual([...USER_PATH_STATUSES]);
    expect(enumValues('PathStatus')).toEqual([...PATH_STATUSES]);
  });

  it('has retired the RIASEC vocabulary entirely (D-134)', () => {
    /* Acceptance criterion 13: the recommendation model is gone from the schema,
       not merely unused by the code. A leftover column is a leftover concept,
       and the next person to read the schema would implement against it. */
    expect(SCHEMA).not.toMatch(/RiasecDimension/);
    expect(SCHEMA).not.toMatch(/riasec_letter|riasecLetter/);
  });

  describe('PathAssessment', () => {
    const assessment = modelBody('PathAssessment');

    it('belongs to a path and versions within it (D-134)', () => {
      /* Not `@unique` on `pathId`: that would forbid the copy-on-write
         versioning D-049 requires. "One assessment per path" is the pair of
         partial unique indexes the migration adds instead. */
      expect(assessment).toMatch(/pathId\s+String/);
      expect(assessment).toMatch(/@@unique\(\[pathId, version\]\)/);
    });
  });

  describe('PathAssessmentBand', () => {
    const band = modelBody('PathAssessmentBand');

    it('maps a score range to a level of the same instrument', () => {
      expect(band).toMatch(/levelId\s+String/);
      expect(band).toMatch(/minScore\s+Int/);
      expect(band).toMatch(/maxScore\s+Int/);
    });

    it('names each level at most once per version', () => {
      /* Two bands for one rung would make the placement depend on read order. */
      expect(band).toMatch(/@@unique\(\[assessmentId, levelId\]\)/);
    });
  });

  describe('PathAssessmentResult', () => {
    const result = modelBody('PathAssessmentResult');

    it('stores the total and what was attainable', () => {
      /* maxScore travels with the result so a historical attempt can still be
         shown as a percentage after the question bank changes size. */
      expect(result).toMatch(/totalScore\s+Int/);
      expect(result).toMatch(/maxScore\s+Int/);
    });

    it('records which assessment version produced it', () => {
      expect(result).toMatch(/assessmentVersion\s+Int/);
    });

    it('appends rather than replacing — the placement is the unique thing', () => {
      expect(result).not.toMatch(/userId\s+String\s+@unique/);
    });
  });

  describe('PathAssessmentResponse', () => {
    const response = modelBody('PathAssessmentResponse');

    it('allows one answer per question per attempt', () => {
      expect(response).toMatch(/@@unique\(\[resultId, questionId\]\)/);
    });

    it('refuses to let bank edits delete the answers people gave', () => {
      /* Restrict, not Cascade: editing a question in Phase 5 must not silently
         remove historical responses and change past results. Deleting the
         *result* may cascade — that removes an attempt as a whole, which is
         coherent — so only the bank relations are asserted here. */
      expect(response).toMatch(/question\s+AssessmentQuestion[^\n]*onDelete:\s*Restrict/);
      expect(response).toMatch(/option\s+AssessmentOption[^\n]*onDelete:\s*Restrict/);
    });
  });

  describe('Level', () => {
    const level = modelBody('Level');

    it('numbers rungs uniquely within a path', () => {
      expect(level).toMatch(/@@unique\(\[pathId, position\]\)/);
    });

    it('carries the composite key the placement foreign key targets (D-134)', () => {
      /* Not a duplicate of the primary key: it is what makes "a level of the
         same path" a fact the database enforces rather than a check the service
         has to remember to run. */
      expect(level).toMatch(/@@unique\(\[id, pathId\]\)/);
    });
  });

  describe('PathCourse', () => {
    const membership = modelBody('PathCourse');

    it('holds the placement as a nullable level and position, and nothing else', () => {
      /* The state is derived from `levelId` being null or not. A status column
         beside it would be a second opinion about the same fact — which is what
         `PathMembershipStatus` had become (D-134). */
      expect(membership).toMatch(/levelId\s+String\?/);
      expect(membership).toMatch(/position\s+Int\?/);
      expect(membership).not.toMatch(/status\s+PathMembershipStatus/);
      expect(membership).not.toMatch(/displayOrder/);
    });

    it('keeps two courses out of one slot', () => {
      expect(membership).toMatch(/@@unique\(\[levelId, position\]\)/);
    });

    it('names a level through the composite key, so it must belong to the path', () => {
      expect(membership).toMatch(/references:\s*\[id, pathId\]/);
    });
  });

  describe('Course', () => {
    const course = modelBody('Course');

    it('bridges to Moodle by id only, and uniquely (§1)', () => {
      expect(course).toMatch(/moodleCourseId\s+Int\s+@unique/);
    });

    it('carries our own status, distinct from the LMS’s visibility', () => {
      expect(course).toMatch(/status\s+CourseStatus/);
    });
  });

  describe('UserPath', () => {
    const userPath = modelBody('UserPath');

    it('lets an employee hold more than one path, once each (D-130)', () => {
      /* The unique index moved from `userId` to the pair: the one-path ceiling
         is gone, and assigning the same path twice is still impossible. */
      expect(userPath).not.toMatch(/userId\s+String\s+@unique/);
      expect(userPath).toMatch(/@@unique\(\[userId, pathId\]\)/);
    });

    it('records when the ministry assigned it, and never leaves that null', () => {
      expect(userPath).toMatch(/assignedAt\s+DateTime\s/);
      expect(userPath).not.toMatch(/confirmedAt/);
    });

    it('will not let a path in use be deleted out from under a learner', () => {
      expect(userPath).toMatch(/path\s+Path[^\n]*onDelete:\s*Restrict/);
    });
  });

  describe('LearnerPlacement', () => {
    const placement = modelBody('LearnerPlacement');

    it('holds one placement per learner per path', () => {
      expect(placement).toMatch(/@@unique\(\[learnerId, pathId\]\)/);
    });

    it('keeps the attempt and the level it named alive beneath it', () => {
      /* Restrict on both: a placement must never point at a level that no longer
         exists, or at an attempt somebody deleted (D-049). */
      expect(placement).toMatch(/result\s+AssessmentResult[^\n]*onDelete:\s*Restrict/);
      expect(placement).toMatch(/level\s+Level[^\n]*onDelete:\s*Restrict/);
    });
  });

  describe('Enrollment', () => {
    const enrolment = modelBody('Enrollment');

    it('enrols a learner in a course once, whatever route reached it (D-003)', () => {
      expect(enrolment).toMatch(/@@unique\(\[userId, courseId\]\)/);
    });

    it('records no verdict — progress lives in completions (D-007, D-134)', () => {
      /* The pass threshold is a product setting; a verdict here would freeze a
         policy decision into a row, and would be a second answer to a question
         `completions` already answers. */
      expect(enrolment).not.toMatch(/\bpassed\b/);
      expect(enrolment).not.toMatch(/gradePercent/);
    });
  });
  // ───────────────────────────────────────────────────────────────────────────
  // Phase 3
  // ───────────────────────────────────────────────────────────────────────────

  describe('Certificate', () => {
    const certificate = modelBody('Certificate');

    it('makes a duplicate certificate impossible, per type and target', () => {
      /* The caller's transition guard is a spam guard, not a uniqueness one
         (D-042 §5). Under a sync that polls forever, this constraint is what
         actually prevents a second credential for the same achievement — the
         application check in front of it only makes the common case cheap. */
      expect(certificate).toMatch(/@@unique\(\[userId, type, courseId\]\)/);
      expect(certificate).toMatch(/@@unique\(\[userId, type, pathId\]\)/);
    });

    it('carries a unique public verification id (D-016)', () => {
      expect(certificate).toMatch(/verificationId\s+String\s+@unique/);
    });

    it('stores the printed holder name and subject title rather than joining them', () => {
      /* The PDF bytes are immutable; people change their names and catalogue
         sync rewrites course titles on every run (D-040). Joining live rows
         would let the public verification page contradict the certificate it
         exists to verify. */
      expect(certificate).toMatch(/holderName\s+String/);
      expect(certificate).toMatch(/subjectTitle\s+String/);
    });

    it('references the stored bytes, with a digest to detect corruption', () => {
      expect(certificate).toMatch(/pdfPath\s+String/);
      expect(certificate).toMatch(/pdfSha256\s+String/);
    });

    it('will not let a certified course or path be deleted out from under it', () => {
      expect(certificate).toMatch(/course\s+Course\?.*onDelete:\s*Restrict/);
      expect(certificate).toMatch(/path\s+Path\?.*onDelete:\s*Restrict/);
    });

    it('constrains the target to match the type, in the database', () => {
      /* Prisma cannot express "exactly one of these, and it is the one the type
         names", so the migration adds it by hand. A credential store is the
         wrong place to find out that a bug produced a certificate for both a
         course and a path, or for neither. */
      const migrationsDir = join(__dirname, '../../prisma/migrations');
      const phase3 = readdirSync(migrationsDir).find((name) =>
        name.endsWith('_phase_3_certificates'),
      );

      expect(phase3).toBeDefined();

      const sql = readFileSync(join(migrationsDir, phase3!, 'migration.sql'), 'utf8');

      expect(sql).toMatch(/CONSTRAINT "certificates_target_matches_type" CHECK/);
    });
  });
  describe('CvProfile', () => {
    const cv = modelBody('CvProfile');

    it('holds one CV per learner', () => {
      /* §4.11 ships one template and no gallery, so there is nothing a second
         row would represent. */
      expect(cv).toMatch(/userId\s+String\s+@unique/);
    });

    it('stores the repeating sections as JSON', () => {
      /* The one place in this schema where a blob is right: nothing queries
         across a job history, it is written and read whole, and §6 sanctions
         it. Shapes are validated at the API boundary instead. */
      expect(cv).toMatch(/experience\s+Json/);
      expect(cv).toMatch(/education\s+Json/);
      expect(cv).toMatch(/skills\s+Json/);
      expect(cv).toMatch(/externalCertifications\s+Json/);
    });

    it('stores no certifications, name or Holland code of its own', () => {
      /*
       * The important assertion in this file. Certifications are read from
       * `certificates` at load time and never copied here, so a CV cannot
       * claim a credential its holder does not have. A column for them would
       * make that possible the day someone wrote to it.
       */
      /* `externalCertifications` is the learner's own typing and belongs here;
         a bare `certifications` field would be the platform's, and must not. */
      expect(cv).not.toMatch(/^\s*certifications\s/m);
      expect(cv).not.toMatch(/hollandCode|riasec/i);
      expect(cv).not.toMatch(/pathName/);
    });

    it('goes with the learner when the account does', () => {
      /* A CV is personal data about one person and nobody else (§2). */
      expect(cv).toMatch(/onDelete:\s*Cascade/);
    });
  });
});
