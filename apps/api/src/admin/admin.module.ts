import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AppConfigModule } from '../config/app-config.module';
import { EmailModule } from '../email/email.module';
import { MoodleModule } from '../moodle/moodle.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAssessmentService } from './admin-assessment.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminEntitiesService } from './admin-entities.service';
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
  imports: [PrismaModule, AppConfigModule, AuditModule, MoodleModule, EmailModule, AuthModule],
  controllers: [...ADMIN_CONTROLLERS],
  providers: [
    AdminDashboardService,
    AdminUsersService,
    AdminEntitiesService,
    AdminAssessmentService,
    AdminPathsService,
  ],
})
export class AdminModule {}
