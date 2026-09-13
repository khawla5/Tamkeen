import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { AssessmentAssignmentResolutionService } from './assessment-assignment-resolution.service';

@Module({
  imports: [PrismaModule],
  providers: [AssessmentAssignmentResolutionService],
  exports: [AssessmentAssignmentResolutionService],
})
export class AssessmentAssignmentModule {}
