import { Injectable, NotFoundException } from '@nestjs/common';

import type { AdminCertificateTemplateView } from '@tamkeen/types';

import { hasMinistryEmblem } from '../certificates/certificate-emblem';
import { renderCertificateHtml } from '../certificates/certificate-template';
import { qrSvgFor } from '../certificates/qr';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

/**
 * §4C.7 — what the next certificate will look like.
 *
 * **The preview renders through `renderCertificateHtml`, the same function
 * issuance calls.** A preview drawn by a second implementation is one that
 * eventually disagrees with the document — and by the time anybody notices,
 * certificates have been issued that look nothing like what was approved.
 *
 * Real template, current settings, and either sample content or the employee and
 * path an administrator picked. So an administrator who has just named a
 * signatory sees that name on a certificate face before anybody earns one.
 */
@Injectable()
export class AdminTemplatesService {
  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * @param subject whom to draw the preview for. Anything left out stays the
   *   obvious sample («اسم الموظف» / «اسم المسار»), so an administrator can try
   *   the real name against the sample path or the reverse.
   */
  async view(
    subject: { userId?: string; pathId?: string } = {},
  ): Promise<AdminCertificateTemplateView> {
    const holder = subject.userId
      ? await this.prisma.user.findUnique({
          where: { id: subject.userId },
          select: { fullName: true },
        })
      : null;
    const path = subject.pathId
      ? await this.prisma.path.findUnique({
          where: { id: subject.pathId },
          select: { name: true, pathCourses: { select: { levelId: true } } },
        })
      : null;

    if ((subject.userId && !holder) || (subject.pathId && !path)) {
      throw new NotFoundException('NOT_FOUND');
    }

    const signatory = {
      name: await this.settings.get('CERT_SIGNATORY_NAME'),
      title: await this.settings.get('CERT_SIGNATORY_TITLE'),
      issuingBody: await this.settings.get('CERT_ISSUING_BODY'),
    };

    const verificationUrl = 'https://tamkeen.gov.example/verify/PREVIEW';

    const previewHtml = renderCertificateHtml({
      type: 'PATH',
      /* Sample unless the administrator picked someone. A real name makes this a
         credential-shaped document with a person's name on it in a browser tab,
         so it is only ever drawn at an administrator's explicit request — it is
         never stored, issued or emailed, and the screen says so. */
      holderName: holder?.fullName ?? 'اسم الموظف',
      subjectTitle: path?.name ?? 'اسم المسار',
      pathName: null,
      courseCount: path ? path.pathCourses.filter((row) => row.levelId !== null).length : 6,
      issuedAt: new Date(),
      verificationId: 'PREVIEW',
      verificationUrl,
      qrSvg: await qrSvgFor(verificationUrl),
      signatory,
    });

    /* Asked of the renderer rather than restated here, so the notice on the
       screen cannot outlive the artwork it is about (TAM-136). */
    return { signatory, previewHtml, hasLogo: hasMinistryEmblem() };
  }
}
