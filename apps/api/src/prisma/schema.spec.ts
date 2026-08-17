import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { USER_ROLES } from '@tamkeen/types';

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

  describe('scope discipline', () => {
    it('contains no product tables — those belong to later phases', () => {
      /* Phase 0 is foundations. Guessing the assessment or path schema now would
         bake in assumptions that Phase 1 has not yet examined. */
      const productModels = [
        'Assessment',
        'AssessmentQuestion',
        'Path',
        'Course',
        'PathCourse',
        'UserPath',
        'Completion',
        'Certificate',
        'CvProfile',
      ];

      const premature = productModels.filter((model) =>
        new RegExp(`model\\s+${model}\\s*\\{`).test(SCHEMA),
      );

      expect(premature).toEqual([]);
    });
  });
});
