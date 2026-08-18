import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { JourneyStateService } from './journey-state.service';

/**
 * Read-only shared state (see `JourneyStateService`).
 *
 * Holds no controller and performs no writes, which is what lets assessment,
 * paths, courses and enrollment all depend on it without a cycle.
 */
@Module({
  imports: [PrismaModule],
  providers: [JourneyStateService],
  exports: [JourneyStateService],
})
export class JourneyModule {}
