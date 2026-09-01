import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AssignmentsService } from './assignments.service';

/**
 * The assessment-assignment gate (D-132). Read-only shared state in the
 * JourneyModule mould: no controller, no writes, so both instrument modules
 * and the dashboard can depend on it without a cycle. The administrative
 * writes live in the admin module.
 */
@Module({
  imports: [PrismaModule, AuditModule],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
