import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import type {
  AdminAssessmentDraft,
  AdminAssessmentOverview,
  AdminAssessmentVersion,
} from '@tamkeen/types';

import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { AdminAssessmentService } from './admin-assessment.service';
import {
  AddDraftQuestionDto,
  ReorderDraftDto,
  SetBandsDto,
  UpdateDraftDto,
  UpdateDraftOptionDto,
  UpdateDraftQuestionDto,
} from './admin.dto';

const uuid = () => new ParseUUIDPipe({ errorHttpStatusCode: 400 });

/**
 * §4C.3 — a path's placement assessment (D-134).
 *
 * **This is the only surface in the product that carries the answer key over the
 * wire, and `@Roles('SUPER_ADMIN')` is the whole of what keeps it there.** D-034
 * is explicit: an instrument whose scoring key is visible in a network response
 * is one a taker can steer, and a *placement* test steered is a person starting
 * their training in the wrong place. The learner's route selects options without
 * `isCorrect`, without `marks` and without the item's level, and an integration
 * test greps that response for the field names this controller returns — a test
 * that only became necessary because these routes exist.
 *
 * **Every route is under its path**, because there is no "the assessment" any
 * more: twelve paths own twelve of them.
 *
 * **Every write targets the draft.** There is no endpoint that edits a published
 * version, which is what makes D-049 structural rather than careful: the rows a
 * past response points at have no route that reaches them.
 */
@Controller('admin/paths/:pathId/assessment')
@Roles('SUPER_ADMIN')
export class AdminAssessmentController {
  constructor(private readonly assessment: AdminAssessmentService) {}

  /** What is live, what is being edited, and every version before it. */
  @Get()
  overview(@Param('pathId', uuid()) pathId: string): Promise<AdminAssessmentOverview> {
    return this.assessment.overview(pathId);
  }

  @Get('draft')
  getDraft(@Param('pathId', uuid()) pathId: string): Promise<AdminAssessmentDraft> {
    return this.assessment.getDraft(pathId);
  }

  @Post('draft')
  @HttpCode(HttpStatus.CREATED)
  createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pathId', uuid()) pathId: string,
    @Req() request: Request,
  ): Promise<AdminAssessmentDraft> {
    return this.assessment.createDraft(pathId, user.id, request.ip ?? null);
  }

  @Delete('draft')
  @HttpCode(HttpStatus.NO_CONTENT)
  discardDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pathId', uuid()) pathId: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.assessment.discardDraft(pathId, user.id, request.ip ?? null);
  }

  @Patch('draft')
  updateDraft(
    @Param('pathId', uuid()) pathId: string,
    @Body() dto: UpdateDraftDto,
  ): Promise<AdminAssessmentDraft> {
    return this.assessment.updateDraft(pathId, dto);
  }

  /** The placement rule. An empty list returns the path to the even split. */
  @Patch('draft/bands')
  setBands(
    @Param('pathId', uuid()) pathId: string,
    @Body() dto: SetBandsDto,
  ): Promise<AdminAssessmentDraft> {
    return this.assessment.setBands(pathId, dto);
  }

  @Post('draft/questions')
  @HttpCode(HttpStatus.CREATED)
  addQuestion(
    @Param('pathId', uuid()) pathId: string,
    @Body() dto: AddDraftQuestionDto,
  ): Promise<AdminAssessmentDraft> {
    return this.assessment.addQuestion(pathId, dto);
  }

  /** Before `:questionId`, so "order" is never read as a question id. */
  @Patch('draft/questions/order')
  reorder(
    @Param('pathId', uuid()) pathId: string,
    @Body() dto: ReorderDraftDto,
  ): Promise<AdminAssessmentDraft> {
    return this.assessment.reorder(pathId, dto);
  }

  @Patch('draft/questions/:questionId')
  updateQuestion(
    @Param('pathId', uuid()) pathId: string,
    @Param('questionId', uuid()) questionId: string,
    @Body() dto: UpdateDraftQuestionDto,
  ): Promise<AdminAssessmentDraft> {
    return this.assessment.updateQuestion(pathId, questionId, dto);
  }

  @Delete('draft/questions/:questionId')
  removeQuestion(
    @Param('pathId', uuid()) pathId: string,
    @Param('questionId', uuid()) questionId: string,
  ): Promise<AdminAssessmentDraft> {
    return this.assessment.removeQuestion(pathId, questionId);
  }

  @Patch('draft/options/:optionId')
  updateOption(
    @Param('pathId', uuid()) pathId: string,
    @Param('optionId', uuid()) optionId: string,
    @Body() dto: UpdateDraftOptionDto,
  ): Promise<AdminAssessmentDraft> {
    return this.assessment.updateOption(pathId, optionId, dto);
  }

  @Post('publish')
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pathId', uuid()) pathId: string,
    @Req() request: Request,
  ): Promise<AdminAssessmentVersion> {
    return this.assessment.publish(pathId, user.id, request.ip ?? null);
  }

  /** A published version, read-only, exactly as it was taken (D-049). */
  @Get('versions/:assessmentId')
  getVersion(@Param('assessmentId', uuid()) assessmentId: string): Promise<AdminAssessmentDraft> {
    return this.assessment.getVersion(assessmentId);
  }
}
