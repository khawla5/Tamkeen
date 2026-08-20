/**
 * In-app notifications (CLAUDE.md §2).
 *
 * §2 is deliberately restrictive here: "a light indicator when a new
 * certificate is issued. Nothing more." No inbox, no feed, no badge counting
 * things a learner never asked to be counted. So what crosses the API boundary
 * is a single number — how many certificates have arrived since the learner
 * last looked at their gallery — and nothing that could grow into an
 * engagement surface without a deliberate decision.
 */
export const NOTIFICATION_TYPES = ['CERTIFICATE_ISSUED'] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface UnreadNotificationsView {
  /** Certificates issued since the learner last opened their gallery. */
  certificates: number;
}
