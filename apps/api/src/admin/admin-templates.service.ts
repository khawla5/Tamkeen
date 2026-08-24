import { Injectable } from '@nestjs/common';

import type { AdminCertificateTemplateView } from '@tamkeen/types';

import { renderCertificateHtml } from '../certificates/certificate-template';
import { qrSvgFor } from '../certificates/qr';
import { SettingsService } from '../settings/settings.service';

/**
 * §4C.7 — what the next certificate will look like.
 *
 * **The preview renders through `renderCertificateHtml`, the same function
 * issuance calls.** A preview drawn by a second implementation is one that
 * eventually disagrees with the document — and by the time anybody notices,
 * certificates have been issued that look nothing like what was approved.
 *
 * Sample content, real template, current settings. So an administrator who has
 * just named a signatory sees that name on a certificate face before anybody
 * earns one.
 */
@Injectable()
export class AdminTemplatesService {
  constructor(private readonly settings: SettingsService) {}

  async view(): Promise<AdminCertificateTemplateView> {
    const signatory = {
      name: await this.settings.get('CERT_SIGNATORY_NAME'),
      title: await this.settings.get('CERT_SIGNATORY_TITLE'),
      issuingBody: await this.settings.get('CERT_ISSUING_BODY'),
    };

    const verificationUrl = 'https://tamkeen.gov.example/verify/PREVIEW';

    const previewHtml = renderCertificateHtml({
      type: 'PATH',
      /* Obviously sample data. A preview that used a real employee's name would
         be a credential-shaped document with somebody's name on it, sitting in
         a browser tab. */
      holderName: 'اسم الموظف',
      subjectTitle: 'اسم المسار',
      pathName: null,
      courseCount: 6,
      issuedAt: new Date(),
      verificationId: 'PREVIEW',
      verificationUrl,
      qrSvg: await qrSvgFor(verificationUrl),
      signatory,
    });

    return { signatory, previewHtml, hasLogo: false };
  }
}
