import { createHash } from 'node:crypto';

import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type { CertificateSummary } from '@tamkeen/types';

import { PrismaService } from '../prisma/prisma.service';
import { CertificateStorageService } from './certificate-storage.service';

export interface CertificateFile {
  bytes: Buffer;
  filename: string;
}

/**
 * The learner's own certificates (§4.10).
 *
 * Everything here is scoped to the requesting user by the **query**, never by a
 * check after the fetch. `findFirst({ where: { id, userId } })` cannot return
 * someone else's certificate; a `findUnique` followed by an ownership `if` can,
 * the first time someone edits the wrong branch.
 */
@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: CertificateStorageService,
  ) {}

  /**
   * The gallery: a flat list, newest first.
   *
   * §4.10 says title, date earned, view, download — "nothing else" — so the
   * verification id is deliberately absent even though it is the learner's own.
   * It is printed on the certificate, which is where a holder shares it from.
   */
  async list(userId: string): Promise<CertificateSummary[]> {
    const certificates = await this.prisma.certificate.findMany({
      where: { userId },
      select: { id: true, type: true, subjectTitle: true, issuedAt: true },
      orderBy: { issuedAt: 'desc' },
    });

    return certificates.map((certificate) => ({
      id: certificate.id,
      type: certificate.type,
      subjectTitle: certificate.subjectTitle,
      issuedAt: certificate.issuedAt.toISOString(),
    }));
  }

  /**
   * The stored bytes, for viewing or downloading.
   *
   * **The digest is checked before the bytes are served.** That is why
   * `pdfSha256` exists: a certificate is a credential, and handing someone a
   * PDF that no longer matches what was issued — truncated by a failed write,
   * corrupted on disk, or altered — is worse than telling them it is
   * unavailable. A mismatch is loud in the log and a refusal to the caller,
   * because a silently wrong credential is the failure nobody notices.
   */
  async getFile(userId: string, certificateId: string): Promise<CertificateFile> {
    const certificate = await this.prisma.certificate.findFirst({
      where: { id: certificateId, userId },
      select: { id: true, type: true, pdfPath: true, pdfSha256: true },
    });

    if (!certificate) {
      /* Not "forbidden": a learner asking for a certificate that is not theirs
         learns only that they do not have one, which is all they are owed. */
      throw new NotFoundException('CERTIFICATE_NOT_FOUND');
    }

    let bytes: Buffer;
    try {
      bytes = await this.storage.read(certificate.pdfPath);
    } catch (error) {
      this.logger.error(
        `Certificate ${certificate.id} is recorded but its file is unreadable at ` +
          `${certificate.pdfPath}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new InternalServerErrorException('CERTIFICATE_FILE_UNAVAILABLE');
    }

    const digest = createHash('sha256').update(bytes).digest('hex');

    if (digest !== certificate.pdfSha256) {
      this.logger.error(
        `Certificate ${certificate.id} failed its integrity check — stored bytes at ` +
          `${certificate.pdfPath} do not match the digest recorded at issue time`,
      );
      throw new InternalServerErrorException('CERTIFICATE_FILE_CORRUPT');
    }

    return { bytes, filename: filenameFor(certificate.type, certificate.id) };
  }
}

/**
 * A filename that is safe on every platform and says what the file is.
 *
 * Built from the type and the row id rather than the Arabic subject title: a
 * title can contain characters a filesystem or a `Content-Disposition` header
 * handles badly, and getting that wrong turns a download into a mojibake
 * filename or a broken header.
 */
function filenameFor(type: 'COURSE' | 'PATH', id: string): string {
  return `tamkeen-${type.toLowerCase()}-certificate-${id}.pdf`;
}
