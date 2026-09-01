import { Module } from '@nestjs/common';

import { AssignmentsModule } from '../assignments/assignments.module';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EnglishAssessmentController } from './english-assessment.controller';
import { EnglishAssessmentService } from './english-assessment.service';

/**
 * §4.13. Note what is *not* imported: `JourneyModule`.
 *
 * The Holland assessment needs it because its retake rule turns on whether a
 * path is confirmed (D-015). The English test gates on nothing and is gated by
 * nothing (D-123), so it has no business reading the journey — and not importing
 * it is what keeps that true as both grow.
 */
@Module({
  imports: [PrismaModule, AuditModule, AssignmentsModule],
  controllers: [EnglishAssessmentController],
  providers: [EnglishAssessmentService],
  exports: [EnglishAssessmentService],
})
export class EnglishAssessmentModule {}
