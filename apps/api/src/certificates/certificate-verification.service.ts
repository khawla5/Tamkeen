import { Injectable, NotFoundException } from '@nestjs/common';

import type { CertificateVerificationView } from '@tamkeen/types';

import { PrismaService } from '../prisma/prisma.service';

/**
 * The public certificate check (§2, D-016).
 *
 * **The `select` below is the privacy boundary.** It names the four fields the
 * verification page may show, so employee id, email, department, the quiz grade
 * and even the internal row id never leave the database on this path — not
 * "are not rendered", but are never loaded. Widening the page means widening
 * this select, which is a visible act in a review rather than a template edit.
 *
 * **Unknown means 404, not "invalid".** There is no payload that says a
 * certificate is fake, because we cannot know that: an id we do not hold might
 * be a typo, a truncated scan, or an invention. Answering "not found" says only
 * what is true, and it keeps the response for a wrong id indistinguishable from
 * the response for one that never existed — which is what makes guessing
 * pointless rather than merely slow.
 */
@Injectable()
export class CertificateVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async verify(verificationId: string): Promise<CertificateVerificationView> {
    /* Bounded before it reaches the database. The real ids are 43 base64url
       characters; anything else is not a near miss worth querying, and an
       unbounded string on an unauthenticated route is free work for whoever
       sends it. */
    if (!isPlausibleVerificationId(verificationId)) {
      throw new NotFoundException('CERTIFICATE_NOT_FOUND');
    }

    const certificate = await this.prisma.certificate.findUnique({
      where: { verificationId },
      select: {
        type: true,
        holderName: true,
        subjectTitle: true,
        issuedAt: true,
      },
    });

    if (!certificate) {
      throw new NotFoundException('CERTIFICATE_NOT_FOUND');
    }

    return {
      type: certificate.type,
      holderName: certificate.holderName,
      subjectTitle: certificate.subjectTitle,
      issuedAt: certificate.issuedAt.toISOString(),
      valid: true,
    };
  }
}

/**
 * The shape `generateToken()` produces: 32 CSPRNG bytes, base64url, unpadded.
 *
 * A length and alphabet check, not a validity check — it exists to reject
 * obvious junk cheaply, and a value that passes it is still overwhelmingly
 * likely to be absent.
 */
export function isPlausibleVerificationId(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}
