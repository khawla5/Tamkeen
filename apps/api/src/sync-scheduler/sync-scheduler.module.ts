import { Module } from '@nestjs/common';

import { CatalogSyncModule } from '../catalog-sync/catalog-sync.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { CompletionSyncModule } from '../completion-sync/completion-sync.module';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { SyncSchedulerService } from './sync-scheduler.service';

/**
 * The scheduled LMS sync (D-005).
 *
 * Imports the modules whose work it drives; it owns none of that work itself,
 * which is what keeps BullMQ out of the services and lets them be tested
 * without Redis.
 */
@Module({
  imports: [CatalogSyncModule, CompletionSyncModule, EnrollmentModule, CertificatesModule],
  providers: [SyncSchedulerService],
  exports: [SyncSchedulerService],
})
export class SyncSchedulerModule {}
