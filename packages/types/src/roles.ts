/**
 * RBAC foundation — the three portals of the system (CLAUDE.md §1, §6).
 *
 * EMPLOYEE     → the main user portal (assessment, path, certificates, CV).
 * ENTITY       → the entity/reviewer portal (Phase 4).
 * SUPER_ADMIN  → the super-admin portal (Phase 5).
 */
export const USER_ROLES = ['EMPLOYEE', 'ENTITY', 'SUPER_ADMIN'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}
