import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AppConfigModule } from '../config/app-config.module';
import { MoodleModule } from '../moodle/moodle.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EntityCourseManagementService } from './entity-course-management.service';
import { EntityCoursesService } from './entity-courses.service';
import { EntityDashboardService } from './entity-dashboard.service';
import { EntityLearnersService } from './entity-learners.service';
import { EntityProfileService } from './entity-profile.service';
import { EntityScopeService } from './entity-scope.service';
import { EntityController } from './entity.controller';

/**
 * The entity / reviewer portal (§4B, Phase 4).
 *
 * `EntityScopeService` is exported because Phase 5's super-admin course
 * oversight (§4C.5) reads the same courses through the same scope — an admin is
 * simply an unscoped caller (D-062), and giving them a parallel query would be
 * the second implementation that eventually disagrees with this one.
 */
@Module({
  imports: [PrismaModule, AppConfigModule, AuditModule, MoodleModule],
  controllers: [EntityController],
  providers: [
    EntityScopeService,
    EntityCoursesService,
    EntityCourseManagementService,
    EntityLearnersService,
    EntityDashboardService,
    EntityProfileService,
  ],
  exports: [EntityScopeService],
})
export class EntityModule {}
