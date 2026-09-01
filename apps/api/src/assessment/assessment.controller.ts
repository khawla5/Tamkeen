import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import type { AssessmentResultView, AssessmentView } from '@tamkeen/types';

import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { AssessmentService } from './assessment.service';
import { SubmitAssessmentDto } from './assessment.dto';

/**
 * §4.3. Every endpoint here is authenticated by omission — the global
 * SessionGuard is fail-closed, so nothing needs to opt in.
 */
@Controller('assessment')
@Roles('EMPLOYEE')
export class AssessmentController {
  constructor(private readonly assessment: AssessmentService) {}

  @Get()
  getActive(@CurrentUser() user: AuthenticatedUser): Promise<AssessmentView> {
    return this.assessment.getActive(user.id);
  }

  /** Null rather than 404: "not assessed yet" is a normal state the dashboard
   *  renders, not an error every caller must catch. */
  @Get('result')
  getResult(@CurrentUser() user: AuthenticatedUser): Promise<AssessmentResultView | null> {
    return this.assessment.getLatestResult(user.id);
  }

  @Post('submit')
  @HttpCode(HttpStatus.CREATED)
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitAssessmentDto,
    @Req() request: Request,
  ): Promise<AssessmentResultView> {
    return this.assessment.submit(user.id, dto, request.ip ?? null);
  }
}
