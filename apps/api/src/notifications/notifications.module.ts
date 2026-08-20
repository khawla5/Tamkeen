import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * In-app notifications (§2, Phase 3).
 *
 * Deliberately has no dependency on the certificates module: rows are written
 * by whatever performs the thing being announced, and this module only reads
 * them. That keeps the indicator from becoming a place features push to.
 */
@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
