import { Injectable } from '@nestjs/common';

import { cvDocumentHtml } from '@tamkeen/types';

import { fontFaceCss } from '../certificates/certificate-fonts';
import { PdfRendererService } from '../certificates/pdf-renderer.service';
import { CvService } from './cv.service';

/**
 * The CV as a PDF (§4.11, D-050).
 *
 * **Rendered on demand, not stored — the opposite of a certificate, and
 * deliberately so.** A certificate is a credential: its bytes are produced once
 * and kept forever, because the artefact a third party checks has to be the
 * artefact that was issued. A CV is a living document. The learner edits it,
 * earns another certificate, and expects the next export to say so. Storing it
 * would mean either a stale file or an invalidation rule for something nobody
 * verifies. So there is no `cv_pdfs` table, and the export always reflects the
 * CV as it stands.
 *
 * Everything else is shared with the certificate path: the same Chromium, the
 * same base64-inlined typeface, the same `document.fonts.ready` await. And the
 * document itself is the exact function the live preview renders, so what the
 * learner approved on screen is what the file contains.
 */
@Injectable()
export class CvExportService {
  constructor(
    private readonly cv: CvService,
    private readonly renderer: PdfRendererService,
  ) {}

  async render(userId: string): Promise<{ bytes: Buffer; filename: string }> {
    const view = await this.cv.get(userId);

    const html = cvDocumentHtml(
      { profile: view.profile, autofill: view.autofill },
      { fontCss: fontFaceCss() },
    );

    /* Portrait — the CV template declares A4 portrait in its own @page rule,
       and `preferCSSPageSize` in the renderer honours it. */
    const bytes = await this.renderer.render(html, { landscape: false });

    return { bytes, filename: filenameFor(view.profile.fullName) };
  }
}

/**
 * `cv-abdullah-al-damati.pdf`, or just `cv.pdf` when the name yields nothing
 * ASCII.
 *
 * Built from the name only where it is safe to: an Arabic name in a
 * `Content-Disposition` header needs RFC 5987 encoding that not every client
 * handles, and a mojibake filename is a worse outcome than a generic one. The
 * name is on the first line of the document itself either way.
 */
function filenameFor(fullName: string): string {
  const slug = fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return slug.length > 0 ? `cv-${slug}.pdf` : 'cv.pdf';
}
