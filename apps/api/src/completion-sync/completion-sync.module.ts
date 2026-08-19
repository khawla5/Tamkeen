import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../email/email.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CompletionSyncService } from './completion-sync.service';

/** Completion sync (Phase 2E). `LMS_PORT` comes from the global MoodleModule. */
@Module({
  imports: [PrismaModule, AuditModule, EmailModule],
  providers: [CompletionSyncService],
  exports: [CompletionSyncService],
})
export class CompletionSyncModule {}
