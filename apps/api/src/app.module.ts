import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AssessmentModule } from './assessment/assessment.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CatalogSyncModule } from './catalog-sync/catalog-sync.module';
import { CertificatesModule } from './certificates/certificates.module';
import { CvModule } from './cv/cv.module';
import { EntityModule } from './entity/entity.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CompletionSyncModule } from './completion-sync/completion-sync.module';
import { SyncSchedulerModule } from './sync-scheduler/sync-scheduler.module';
import { CoursesModule } from './courses/courses.module';
import { EnrollmentModule } from './enrollment/enrollment.module';
import { JourneyModule } from './journey/journey.module';
import { PathsModule } from './paths/paths.module';
import { ProfileModule } from './profile/profile.module';
import { CsrfGuard } from './auth/csrf.guard';
import { RolesGuard } from './auth/roles.guard';
import { SessionGuard } from './auth/session.guard';
import { AppConfigModule, AppConfigService } from './config/app-config.module';
import { EmailModule } from './email/email.module';
import { HealthModule } from './health/health.module';
import { MoodleModule } from './moodle/moodle.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    AuditModule,
    EmailModule,
    /*
     * Rate limiting (§2 security baseline).
     *
     * A single named limiter, deliberately: with several named throttlers
     * configured, @nestjs/throttler applies *all* of them to *every* route, so a
     * strict "auth" limiter defined here would throttle the whole API to its
     * limit. Auth endpoints instead override this one with @Throttle({ default: … }).
     *
     * Storage is in-process (D-028): correct for a single API instance, which is
     * the Phase 0 target. Horizontal scaling needs a shared store — that is a
     * Phase 7 deployment concern, and per-account lockout (which lives in the
     * database) is unaffected by instance count either way.
     */
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get('API_RATE_LIMIT_WINDOW_SECONDS') * 1000,
            limit: config.get('API_RATE_LIMIT_MAX_REQUESTS'),
          },
        ],
        /* Cannot be disabled in production — enforced by validateEnv. */
        skipIf: () => !config.get('RATE_LIMIT_ENABLED'),
      }),
    }),
    MoodleModule,
    AuthModule,
    HealthModule,
    /* Phase 1. JourneyModule is read-only shared state and is imported by the
       four below rather than depended on between them, which is what keeps
       assessment ↔ dashboard from becoming a cycle. */
    JourneyModule,
    AssessmentModule,
    PathsModule,
    CoursesModule,
    EnrollmentModule,
    ProfileModule,
    /* Phase 2. */
    CatalogSyncModule,
    CompletionSyncModule,
    SyncSchedulerModule,
    /* Phase 3. */
    CertificatesModule,
    NotificationsModule,
    CvModule,
    /* Phase 4. */
    EntityModule,
  ],
  providers: [
    /*
     * Guard order matters and follows registration order:
     *   1. ThrottlerGuard — cheapest rejection first, before any database work.
     *   2. CsrfGuard      — reject forged state-changing requests before they act.
     *   3. SessionGuard   — authenticate; fail-closed unless @Public().
     *   4. RolesGuard     — authorize; needs the user SessionGuard resolved.
     */
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
