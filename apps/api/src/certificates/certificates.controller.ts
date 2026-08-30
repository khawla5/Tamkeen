import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import type { CertificateSummary, CertificateVerificationView } from '@tamkeen/types';

import { CurrentUser, Public, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { CertificateVerificationService } from './certificate-verification.service';
import { CertificatesService } from './certificates.service';

/**
 * §4.10 / §2 — certificates.
 *
 * One public route and two authenticated ones. The public one is the exception
 * and is marked as such; everything else is scoped to the signed-in learner.
 */
@Controller('certificates')
@Roles('EMPLOYEE')
export class CertificatesController {
  constructor(
    private readonly certificates: CertificatesService,
    private readonly verification: CertificateVerificationService,
  ) {}

  /** The gallery (§4.10). */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<CertificateSummary[]> {
    return this.certificates.list(user.id);
  }

  /**
   * The stored PDF — the same bytes that were rendered at issue time.
   *
   * **One route for both "view" and "download"**, differing only in
   * `Content-Disposition`. They are the same resource; two endpoints would mean
   * two places for the ownership check to be got wrong.
   *
   * `no-store` because the response is a personal document: a shared or proxied
   * cache holding a ministry employee's certificate is exactly the kind of
   * accidental disclosure §2 asks us to avoid.
   */
  @Get(':id/file')
  @Header('Cache-Control', 'no-store, private')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  async file(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) certificateId: string,
    @Query('disposition') disposition: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.certificates.getFile(user.id, certificateId);

    /* Anything other than an explicit "attachment" renders in the browser's PDF
       viewer, which is what "view" means on the gallery card. */
    const asAttachment = disposition === 'attachment';

    response.setHeader(
      'Content-Disposition',
      `${asAttachment ? 'attachment' : 'inline'}; filename="${file.filename}"`,
    );

    return new StreamableFile(file.bytes, { type: 'application/pdf' });
  }

  /**
   * Confirms a certificate to a third party, without a login (D-016).
   *
   * One of two unauthenticated reads in the product — the landing explorer's
   * `GET /public/paths` is the other (TAM-150) — and both are marked the same
   * deliberate way, for the same three reasons:
   *
   *  - **`@Public()` is deliberate and greppable.** Authentication is on by
   *    default via a global guard, so this line is the whole exposure.
   *  - **Rate-limited well below the default.** The id is 256 bits of CSPRNG, so
   *    guessing one is not a threat worth modelling — but an open endpoint that
   *    hits the database on every call is, and 20 per minute is far more than
   *    any real verifier needs.
   *  - **`X-Robots-Tag`.** The page carries a `noindex` meta tag, but the API
   *    response is fetchable on its own and a crawler that reaches it must not
   *    put a ministry employee's name and credential into a search index.
   *    Belt and braces, because the cost of being wrong here is permanent.
   *
   * Not a UUID param: `verificationId` is base64url, and validating its shape
   * belongs with the service that knows how it was minted.
   */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @Header('Cache-Control', 'no-store')
  @Get('verify/:verificationId')
  verify(@Param('verificationId') verificationId: string): Promise<CertificateVerificationView> {
    return this.verification.verify(verificationId);
  }
}
