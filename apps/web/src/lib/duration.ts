/**
 * Course durations are stored in minutes and shown in hours.
 *
 * One helper rather than an inline `/ 60` at each call site, so every screen
 * rounds the same way — a course shown as "4 ساعات" in the catalogue and
 * "3 ساعات" on its own page is the kind of inconsistency nobody files a bug for
 * and everybody notices.
 *
 * The number itself is still formatted through the shared layer (D-018); this
 * only converts the unit.
 */
export function toHours(durationMinutes: number | null): number | null {
  if (durationMinutes === null) {
    return null;
  }

  /* Rounded to the nearest half hour, then presented as a whole number of hours
     where possible — durations here are nominal effort, not a schedule. */
  return Math.max(1, Math.round(durationMinutes / 60));
}

/** Total nominal hours across a set of courses. */
export function totalHours(durations: readonly (number | null)[]): number {
  const minutes = durations.reduce<number>((sum, value) => sum + (value ?? 0), 0);

  return Math.max(0, Math.round(minutes / 60));
}
