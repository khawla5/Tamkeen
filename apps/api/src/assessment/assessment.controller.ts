import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import type { AssessmentResultView, AssessmentView } from '@tamkeen/types';

import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { AssessmentService } from './assessment.service';
import { SubmitAssessmentDto } from './assessment.dto';

/**
 * §4.3 — a path's assessment (D-134).
 *
 * Every route is under the path it belongs to, because there is no such thing as
 * "the assessment" any more: an employee may hold two paths and owe two of them.
 * Authenticated by omission — the global SessionGuard is fail-closed, so nothing
 * needs to opt in.
 */
@Controller('paths/:pathId/assessment')
@Roles('EMPLOYEE')
export class AssessmentController {
  constructor(private readonly assessment: AssessmentService) {}

  @Get()
  getActive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pathId', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) pathId: string,
  ): Promise<AssessmentView> {
    return this.assessment.getActive(user.id, pathId);
  }

  /** Null rather than 404: "not placed yet" is a normal state the dashboard
   *  renders, not an error every caller must catch. */
  @Get('result')
  getResult(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pathId', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) pathId: string,
  ): Promise<AssessmentResultView | null> {
    return this.assessment.getResult(user.id, pathId);
  }

  @Post('attempts')
  @HttpCode(HttpStatus.CREATED)
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pathId', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) pathId: string,
    @Body() dto: SubmitAssessmentDto,
    @Req() request: Request,
  ): Promise<AssessmentResultView> {
    return this.assessment.submit(user.id, pathId, dto, request.ip ?? null);
  }
}
