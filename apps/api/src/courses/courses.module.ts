import { Module } from '@nestjs/common';

import { JourneyModule } from '../journey/journey.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

/* MoodleModule is @Global, so LMS_PORT resolves without importing it — but the
   dependency is real (courseUrl), and Phase 2 will want it visible here. */
@Module({
  imports: [PrismaModule, JourneyModule],
  controllers: [CoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}
