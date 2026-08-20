import { Body, Controller, Get, Header, Put, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';

import type { CvView } from '@tamkeen/types';

import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { CvExportService } from './cv-export.service';
import { SaveCvDto } from './cv.dto';
import { CvService } from './cv.service';

/** The CV builder (§4.11). Always the caller's own CV — there is no id here. */
@Controller('cv')
export class CvController {
  constructor(
    private readonly cv: CvService,
    private readonly export_: CvExportService,
  ) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<CvView> {
    return this.cv.get(user.id);
  }

  /**
   * **PUT, not PATCH**: §4.11 asks for one save, and the document is written
   * whole. Reordering entries, removing one, and editing another are the same
   * operation on a CV form — modelling them as partial updates would invent a
   * merge problem the product does not have.
   */
  @Put()
  save(@CurrentUser() user: AuthenticatedUser, @Body() body: SaveCvDto): Promise<CvView> {
    return this.cv.save(user.id, body);
  }

  /**
   * The PDF (§4.11 — "one save, one export").
   *
   * Always an attachment: this is an export, and the live preview already
   * covers looking at it. `no-store, private` because a CV is personal data —
   * a shared or proxied cache holding a ministry employee's CV is the kind of
   * accidental disclosure §2 exists to prevent.
   *
   * Renders the **saved** document, which is why the builder disables this
   * button while there are unsaved edits: a file that quietly differs from the
   * preview it was exported from would be worse than an unavailable one.
   */
  @Get('export')
  @Header('Cache-Control', 'no-store, private')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  async exportPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.export_.render(user.id);

    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);

    return new StreamableFile(file.bytes, { type: 'application/pdf' });
  }
}
