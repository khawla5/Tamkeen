import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AssessmentController } from './assessment.controller';
import { AssessmentService } from './assessment.service';

@Module({
  imports: [PrismaModule, AuditModule, EnrollmentModule],
  controllers: [AssessmentController],
  providers: [AssessmentService],
})
export class AssessmentModule {}
