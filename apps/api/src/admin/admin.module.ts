import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AppConfigModule } from '../config/app-config.module';
import { MoodleModule } from '../moodle/moodle.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminController } from './admin.controller';

/**
 * The super-admin portal (§4C, Phase 5).
 *
 * Grows one service per sub-phase — users, assessment, paths, course oversight,
 * settings, certificate templates, audit — all behind the single
 * `@Roles('SUPER_ADMIN')` controller, so there is exactly one place to check
 * that the whole portal is closed to everyone else.
 */
@Module({
  imports: [PrismaModule, AppConfigModule, AuditModule, MoodleModule],
  controllers: [AdminController],
  providers: [AdminDashboardService],
})
export class AdminModule {}
