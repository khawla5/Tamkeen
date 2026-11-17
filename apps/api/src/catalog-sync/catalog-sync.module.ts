import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CatalogSyncService } from './catalog-sync.service';
import { CourseAvailabilityService } from './course-availability.service';

/**
 * Catalogue sync (Phase 2C).
 *
 * `MoodleModule` is `@Global`, so `LMS_PORT` resolves without importing it —
 * but the dependency is real and this module is meaningless without it.
 */
@Module({
  imports: [PrismaModule, AuditModule],
  providers: [CatalogSyncService, CourseAvailabilityService],
  exports: [CatalogSyncService, CourseAvailabilityService],
})
export class CatalogSyncModule {}
