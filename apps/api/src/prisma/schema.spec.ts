import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  COURSE_STATUSES,
  RIASEC_LETTERS,
  USER_PATH_COURSE_STATUSES,
  USER_PATH_STATUSES,
  USER_ROLES,
} from '@tamkeen/types';

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
    it('contains no tables belonging to later phases', () => {
      /*
       * Phase 2 added `Completion`, so it has left this list — the guard tracks
       * what has actually been built rather than being widened to keep quiet.
       * Certificates and the CV still belong to Phase 3, and `Enrollment`
       * remains deliberately unbuilt: §6 marks it optional, and
       * `user_path_courses.enrolled_at` answers the only question anything asks
       * (D-041).
       */
      const laterPhaseModels = ['Certificate', 'CvProfile', 'Enrollment'];

      const premature = laterPhaseModels.filter((model) =>
        new RegExp(`model\\s+${model}\\s*\\{`).test(SCHEMA),
      );

      expect(premature).toEqual([]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Phase 1
  // ───────────────────────────────────────────────────────────────────────────

  it('keeps RiasecDimension in lockstep with RIASEC_LETTERS in @tamkeen/types', () => {
    /* Canonical order matters as well as membership: it is the tie-break for
       ranking (D-031), so a reordered enum would quietly change results. */
    expect(enumValues('RiasecDimension')).toEqual([...RIASEC_LETTERS]);
  });

  it('keeps CourseStatus in lockstep with COURSE_STATUSES in @tamkeen/types', () => {
    expect(enumValues('CourseStatus')).toEqual([...COURSE_STATUSES]);
  });

  it('keeps the user-path status enums in lockstep with the shared types', () => {
    expect(enumValues('UserPathStatus')).toEqual([...USER_PATH_STATUSES]);
    expect(enumValues('UserPathCourseStatus')).toEqual([...USER_PATH_COURSE_STATUSES]);
  });

  describe('AssessmentOptionWeight', () => {
    const weight = modelBody('AssessmentOptionWeight');

    it('stores the dimension as an enum, not free text or JSON (§6)', () => {
      /* A mistyped letter in a JSON blob contributes nothing and fails silently,
         producing a subtly wrong Holland Code that nothing surfaces. An enum
         column makes the database reject it. */
      expect(weight).toMatch(/dimension\s+RiasecDimension/);
      expect(weight).not.toMatch(/Json/);
    });

    it('allows one weight per option per dimension', () => {
      /* Two rows for the same pair would double that dimension's contribution. */
      expect(weight).toMatch(/@@unique\(\[optionId, dimension\]\)/);
    });
  });

  describe('AssessmentResult', () => {
    const result = modelBody('AssessmentResult');

    it('stores all six dimension scores, not just the code (§3A)', () => {
      for (const column of ['scoreR', 'scoreI', 'scoreA', 'scoreS', 'scoreE', 'scoreC']) {
        expect(result).toMatch(new RegExp(`${column}\\s+Int`));
      }
    });

    it('stores the derived Holland Code and the attainable maximum', () => {
      /* maxScore travels with the result so a historical profile can still be
         shown as a percentage after the question bank changes size. */
      expect(result).toMatch(/code\s+String/);
      expect(result).toMatch(/maxScore\s+Int/);
    });

    it('records which assessment version produced it', () => {
      expect(result).toMatch(/assessmentVersion\s+Int/);
    });
  });

  describe('AssessmentResponse', () => {
    const response = modelBody('AssessmentResponse');

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

  describe('Path', () => {
    const path = modelBody('Path');

    it('is tagged with exactly one primary RIASEC letter (§3A)', () => {
      /* Singular and required — the gold rule has nothing to match on if a path
         can carry several letters or none. */
      expect(path).toMatch(/riasecLetter\s+RiasecDimension\s/);
      expect(path).not.toMatch(/riasecLetters?\s+RiasecDimension\[\]/);
      expect(path).not.toMatch(/riasecLetter\s+RiasecDimension\?/);
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

    it('makes "one path per user" a database constraint, not a convention (D-002)', () => {
      /*
       * The whole product rests on this. A unique index means a second path
       * cannot be inserted even by a bug or two concurrent confirm requests —
       * application-level checks alone lose that race.
       */
      expect(userPath).toMatch(/userId\s+String\s+@unique/);
    });

    it('records when the path was confirmed, which is what locks it', () => {
      expect(userPath).toMatch(/confirmedAt\s+DateTime\?/);
    });

    it('will not let a path in use be deleted out from under a learner', () => {
      expect(userPath).toMatch(/path\s+Path[^\n]*onDelete:\s*Restrict/);
    });
  });

  describe('UserPathCourse', () => {
    const chosen = modelBody('UserPathCourse');

    it('selects a course at most once within a path', () => {
      expect(chosen).toMatch(/@@unique\(\[userPathId, courseId\]\)/);
    });

    it('mirrors a raw grade, never a pass/fail verdict (D-007)', () => {
      /* The pass threshold is a product setting; storing a verdict here would
         freeze a policy decision into a row. */
      expect(chosen).toMatch(/gradePercent\s+Int\?/);
      expect(chosen).not.toMatch(/\bpassed\b/);
    });
  });
});
