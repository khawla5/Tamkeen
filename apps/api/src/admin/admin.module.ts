import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AppConfigModule } from '../config/app-config.module';
import { EmailModule } from '../email/email.module';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { MoodleModule } from '../moodle/moodle.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SyncSchedulerModule } from '../sync-scheduler/sync-scheduler.module';
import { AdminAssessmentAssignmentsService } from './admin-assessment-assignments.service';
import { AdminAssessmentService } from './admin-assessment.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminLevelsService } from './admin-levels.service';
import { AdminPathAssignmentsService } from './admin-path-assignments.service';
import { AdminCoursesService } from './admin-courses.service';
import { AdminSettingsService } from './admin-settings.service';
import { AdminTemplatesService } from './admin-templates.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminEntitiesService } from './admin-entities.service';
import { AdminImpactService } from './admin-impact.service';
import { AdminPathsService } from './admin-paths.service';
import { AdminUsersService } from './admin-users.service';
import { ADMIN_CONTROLLERS } from './admin.controllers';

/**
 * The super-admin portal (§4C, Phase 5).
 *
 * Grows one service per sub-phase — users, assessment, paths, course oversight,
 * settings, certificate templates, audit — all behind controllers listed in
 * `ADMIN_CONTROLLERS`, which is also what the RBAC suite enumerates. So there is
 * exactly one place to check that the whole portal is closed to everyone else.
 */
@Module({
  imports: [
    PrismaModule,
    AppConfigModule,
    AuditModule,
    MoodleModule,
    EmailModule,
    AuthModule,
    /* §4C.6 changes the sync interval, which has to re-register the
       repeatable job rather than wait for a redeploy (D-072). */
    SyncSchedulerModule,
    /* Placement changes what learners owe, so the admin's ladder edits enrol
       them in it (D-134). */
    EnrollmentModule,
  ],
  controllers: [...ADMIN_CONTROLLERS],
  providers: [
    AdminDashboardService,
    AdminUsersService,
    AdminEntitiesService,
    AdminAssessmentService,
    AdminPathAssignmentsService,
    AdminLevelsService,
    AdminAssessmentAssignmentsService,
    AdminPathsService,
    AdminCoursesService,
    AdminSettingsService,
    AdminTemplatesService,
    AdminAuditService,
    AdminImpactService,
  ],
})
export class AdminModule {}
