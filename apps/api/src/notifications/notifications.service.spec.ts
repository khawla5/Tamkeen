import type { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

/**
 * The in-app indicator (§2), which is a smaller surface than it looks.
 *
 * The tests worth having are about the *queries*: that counting is scoped to
 * the caller and to unread rows, and that marking read touches only rows that
 * were actually unread — because re-reading already-read rows would overwrite
 * when the learner first saw them.
 */

function harness(unread = 0) {
  const counts: unknown[] = [];
  const updates: unknown[] = [];

  const prisma = {
    notification: {
      count: (args: { where: unknown }) => {
        counts.push(args.where);
        return Promise.resolve(unread);
      },
      updateMany: (args: { where: unknown; data: unknown }) => {
        updates.push(args);
        return Promise.resolve({ count: unread });
      },
    },
  } as unknown as PrismaService;

  return { service: new NotificationsService(prisma), counts, updates };
}

describe('NotificationsService', () => {
  describe('unread', () => {
    it('reports how many certificates have arrived unseen', async () => {
      const { service } = harness(3);

      await expect(service.unread('user-1')).resolves.toEqual({ certificates: 3 });
    });

    it('counts only this learner’s unread certificate notifications', async () => {
      /* Scoped by the query. A count filtered afterwards would be a count of
         everybody's notifications until someone noticed. */
      const { service, counts } = harness(1);

      await service.unread('user-1');

      expect(counts[0]).toEqual({
        userId: 'user-1',
        type: 'CERTIFICATE_ISSUED',
        readAt: null,
      });
    });

    it('reports zero rather than failing when there is nothing', async () => {
      const { service } = harness(0);

      await expect(service.unread('user-1')).resolves.toEqual({ certificates: 0 });
    });
  });

  describe('marking read', () => {
    it('updates only rows that were still unread', async () => {
      /*
       * The `readAt: null` filter is the point. Without it, every visit to the
       * gallery would rewrite `readAt` on rows already read — losing when the
       * learner actually first saw each certificate, which is the only thing
       * the column records.
       */
      const { service, updates } = harness(2);

      await service.markCertificatesRead('user-1');

      expect(updates).toHaveLength(1);
      expect(updates[0]).toMatchObject({
        where: { userId: 'user-1', type: 'CERTIFICATE_ISSUED', readAt: null },
        data: { readAt: expect.any(Date) as Date },
      });
    });

    it('is safe to call when nothing is unread', async () => {
      const { service } = harness(0);

      await expect(service.markCertificatesRead('user-1')).resolves.toBeUndefined();
    });
  });
});
