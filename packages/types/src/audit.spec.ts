import { describe, expect, it } from 'vitest';

import {
  AUDIT_ACTION_CATEGORIES,
  AUDIT_ACTION_CATEGORY,
  AuditAction,
  type AuditActionCode,
} from './audit';

/**
 * The audit vocabulary's own guarantees (TAM-138).
 *
 * The `Record<AuditActionCode, …>` type already fails the build on an action
 * with no category. What it cannot catch is the other direction — a category
 * map that has drifted to hold a code the vocabulary no longer defines, or a
 * category nothing uses, which would show the ministry an empty group.
 */
describe('audit action categories', () => {
  const codes = Object.values(AuditAction) as AuditActionCode[];

  it('categorises every action and nothing else', () => {
    expect(Object.keys(AUDIT_ACTION_CATEGORY).sort()).toEqual([...codes].sort());
  });

  it('uses only declared categories, and every one of them', () => {
    const used = new Set(Object.values(AUDIT_ACTION_CATEGORY));

    expect([...used].sort()).toEqual([...AUDIT_ACTION_CATEGORIES].sort());
  });

  it('keeps the action codes and their constant names in step', () => {
    /* A copy-paste that leaves `AUTH_LOGGED_OUT: 'AUTH_LOGIN_FAILED'` would
       silently file every sign-out under sign-in failures, and nothing else
       would notice: both sides are valid strings. */
    for (const [name, code] of Object.entries(AuditAction)) {
      expect(code).toBe(name);
    }
  });
});
