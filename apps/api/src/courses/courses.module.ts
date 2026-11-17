import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { CompletionSyncModule } from '../completion-sync/completion-sync.module';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { JourneyModule } from '../journey/journey.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CoursesController } from './courses.controller';
import { CoursePlayerService } from './course-player.service';
import { CoursesService } from './courses.service';

/* MoodleModule is @Global, so LMS_PORT resolves without importing it — but the
   dependency is real (courseUrl), and Phase 2 will want it visible here. */
@Module({
  imports: [PrismaModule, JourneyModule, AuditModule, EnrollmentModule, CompletionSyncModule],
  controllers: [CoursesController],
  providers: [CoursesService, CoursePlayerService],
})
export class CoursesModule {}
