import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { JourneyModule } from '../journey/journey.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CertificateIssuanceService } from './certificate-issuance.service';
import { CertificateStorageService } from './certificate-storage.service';
import { CertificateVerificationService } from './certificate-verification.service';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';
import { PdfRendererService } from './pdf-renderer.service';

/**
 * Certificates (Phase 3, §4.10).
 *
 * `PdfRendererService` is provided here and exported because the CV builder
 * renders through the same proven pipeline — one Chromium, one set of embedded
 * fonts, one place where the Arabic-shaping problem is solved.
 */
@Module({
  imports: [PrismaModule, AuditModule, JourneyModule],
  controllers: [CertificatesController],
  providers: [
    CertificateIssuanceService,
    CertificateStorageService,
    CertificateVerificationService,
    CertificatesService,
    PdfRendererService,
  ],
  exports: [CertificateIssuanceService, CertificateStorageService, PdfRendererService],
})
export class CertificatesModule {}
