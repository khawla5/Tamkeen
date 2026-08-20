import { Controller, Get, Header, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import type { CertificateVerificationView } from '@tamkeen/types';

import { Public } from '../auth/auth.decorators';
import { CertificateVerificationService } from './certificate-verification.service';

/**
 * §4.10 / §2 — certificates.
 *
 * For now this holds only the **public** verification route. The learner's own
 * gallery is authenticated and arrives with it.
 */
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly verification: CertificateVerificationService) {}

  /**
   * Confirms a certificate to a third party, without a login (D-016).
   *
   * **The only unauthenticated read in the product**, which is why three things
   * are true of it at once:
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
