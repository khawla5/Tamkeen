import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { JourneyStateService } from './journey-state.service';
import { LearnerPathService } from './learner-path.service';

/**
 * Read-only shared state (see `JourneyStateService` and `LearnerPathService`).
 *
 * Holds no controller and performs no writes, which is what lets assessment,
 * paths, courses, certificates and enrollment all depend on it without a cycle.
 */
@Module({
  imports: [PrismaModule],
  providers: [JourneyStateService, LearnerPathService],
  exports: [JourneyStateService, LearnerPathService],
})
export class JourneyModule {}
