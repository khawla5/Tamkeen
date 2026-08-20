import { Injectable } from '@nestjs/common';

import type { UnreadNotificationsView } from '@tamkeen/types';

import { PrismaService } from '../prisma/prisma.service';

/**
 * The in-app indicator (§2).
 *
 * **Read-only from the outside.** Notification *rows* are written where the
 * thing they announce happens — certificate issuance creates them — and nothing
 * a browser can call creates one. That keeps the indicator honest: it can only
 * ever reflect something the system actually did.
 *
 * The two operations here are the whole surface §2 permits: count what has not
 * been seen, and mark it seen. No list endpoint, because there is no list to
 * show — the certificates themselves are the content, and the gallery already
 * renders them.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async unread(userId: string): Promise<UnreadNotificationsView> {
    const certificates = await this.prisma.notification.count({
      where: { userId, type: 'CERTIFICATE_ISSUED', readAt: null },
    });

    return { certificates };
  }

  /**
   * Clears the indicator, because the learner has now seen their certificates.
   *
   * Called when the gallery is opened rather than by a dismiss control: the
   * indicator points at exactly one destination, so arriving there *is* the
   * acknowledgement. A separate "mark as read" button would be a second thing
   * to do about a dot.
   *
   * `updateMany` with a `readAt: null` filter, so re-opening the gallery is a
   * no-op rather than rewriting timestamps on rows that were already read —
   * which would lose when the learner actually first saw them.
   */
  async markCertificatesRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, type: 'CERTIFICATE_ISSUED', readAt: null },
      data: { readAt: new Date() },
    });
  }
}
