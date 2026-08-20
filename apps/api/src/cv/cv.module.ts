import { Module } from '@nestjs/common';

import { CertificatesModule } from '../certificates/certificates.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CvExportService } from './cv-export.service';
import { CvController } from './cv.controller';
import { CvService } from './cv.service';

/**
 * The CV builder (§4.11, Phase 3).
 *
 * Imports `CertificatesModule` for `PdfRendererService` — one Chromium and one
 * set of embedded fonts serve both the certificate and the CV, which is what
 * keeps the Arabic-shaping problem solved in a single place.
 */
@Module({
  imports: [PrismaModule, CertificatesModule],
  controllers: [CvController],
  providers: [CvService, CvExportService],
  exports: [CvService],
})
export class CvModule {}
