import { Module } from '@nestjs/common';

import { AssignmentsModule } from '../assignments/assignments.module';
import { AuditModule } from '../audit/audit.module';
import { JourneyModule } from '../journey/journey.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DashboardController, EnrollmentController } from './enrollment.controller';
import { EnrollmentService } from './enrollment.service';

@Module({
  imports: [PrismaModule, AuditModule, JourneyModule, AssignmentsModule],
  controllers: [EnrollmentController, DashboardController],
  providers: [EnrollmentService],
  /* Exported so the sync scheduler can drive enrolment reconciliation (D-036). */
  exports: [EnrollmentService],
})
export class EnrollmentModule {}
