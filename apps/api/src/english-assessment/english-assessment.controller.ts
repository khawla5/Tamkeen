import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import type { EnglishAssessmentResultView, EnglishAssessmentView } from '@tamkeen/types';

import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { EnglishAssessmentService } from './english-assessment.service';
import { SubmitEnglishAssessmentDto } from './english-assessment.dto';

/**
 * §4.13 — the English placement test.
 *
 * Authenticated by omission: the global SessionGuard is fail-closed, so nothing
 * needs to opt in.
 *
 * **No route here is gated on the Holland journey** (D-123). The test is
 * independent — a learner may take it before their career assessment, between it
 * and choosing a path, or years into one — so there is no equivalent of the
 * catalogue's pre-assessment gate, and nothing to add to `navForState`.
 */
@Controller('english-assessment')
@Roles('EMPLOYEE')
export class EnglishAssessmentController {
  constructor(private readonly english: EnglishAssessmentService) {}

  @Get()
  getActive(): Promise<EnglishAssessmentView> {
    return this.english.getActive();
  }

  /** Null rather than 404: "not taken yet" is a normal state the dashboard
   *  renders, not an error every caller must catch. */
  @Get('result')
  getResult(@CurrentUser() user: AuthenticatedUser): Promise<EnglishAssessmentResultView | null> {
    return this.english.getResult(user.id);
  }

  @Post('submit')
  @HttpCode(HttpStatus.CREATED)
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitEnglishAssessmentDto,
    @Req() request: Request,
  ): Promise<EnglishAssessmentResultView> {
    return this.english.submit(user.id, dto, request.ip ?? null);
  }
}
