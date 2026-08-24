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
  UpdateDraftDto,
  UpdateDraftOptionDto,
  UpdateDraftQuestionDto,
} from './admin.dto';

/**
 * §4C.3 — assessment management.
 *
 * **This is the only surface in the product that carries RIASEC weights over
 * the wire, and `@Roles('SUPER_ADMIN')` is the whole of what keeps them there.**
 * D-034 is explicit: an assessment whose scoring key is visible in a network
 * response is one a taker can steer toward whichever result they already
 * wanted, which would make every gold recommendation downstream theatre. The
 * learner's `GET /assessment` selects options *without* their weights, and an
 * integration test greps that response for the field names this controller
 * returns — a test that only became necessary because these routes exist.
 *
 * **Every write targets the draft.** There is no endpoint that edits a published
 * version, which is what makes D-049 structural rather than careful: the rows a
 * past response points at have no route that reaches them.
 */
@Controller('admin/assessment')
@Roles('SUPER_ADMIN')
export class AdminAssessmentController {
  constructor(private readonly assessment: AdminAssessmentService) {}

  /** What is live, what is being edited, and every version before it. */
  @Get()
  overview(): Promise<AdminAssessmentOverview> {
    return this.assessment.overview();
  }

  @Get('draft')
  getDraft(): Promise<AdminAssessmentDraft> {
    return this.assessment.getDraft();
  }

  /** Opens a draft as a deep copy of the active version (D-069). */
  @Post('draft')
  createDraft(
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<AdminAssessmentDraft> {
    return this.assessment.createDraft(actor.id, request.ip ?? null);
  }

  @Delete('draft')
  @HttpCode(HttpStatus.NO_CONTENT)
  discardDraft(@CurrentUser() actor: AuthenticatedUser, @Req() request: Request): Promise<void> {
    return this.assessment.discardDraft(actor.id, request.ip ?? null);
  }

  @Patch('draft')
  updateDraft(@Body() dto: UpdateDraftDto): Promise<AdminAssessmentDraft> {
    return this.assessment.updateDraft(dto);
  }

  @Post('draft/questions')
  addQuestion(@Body() dto: AddDraftQuestionDto): Promise<AdminAssessmentDraft> {
    return this.assessment.addQuestion(dto);
  }

  @Patch('draft/order')
  reorder(@Body() dto: ReorderDraftDto): Promise<AdminAssessmentDraft> {
    return this.assessment.reorder(dto.questionIds);
  }

  @Patch('draft/questions/:id')
  updateQuestion(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) questionId: string,
    @Body() dto: UpdateDraftQuestionDto,
  ): Promise<AdminAssessmentDraft> {
    return this.assessment.updateQuestion(questionId, dto);
  }

  @Delete('draft/questions/:id')
  removeQuestion(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) questionId: string,
  ): Promise<AdminAssessmentDraft> {
    return this.assessment.removeQuestion(questionId);
  }

  /** Label and per-dimension weights (D-048). */
  @Patch('draft/options/:id')
  updateOption(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) optionId: string,
    @Body() dto: UpdateDraftOptionDto,
  ): Promise<AdminAssessmentDraft> {
    return this.assessment.updateOption(optionId, dto);
  }

  /**
   * Validates and activates the draft (D-070, D-071).
   *
   * An unbalanced bank is refused here and nowhere else — it is the last moment
   * at which the skew is visible, because nothing downstream distinguishes a
   * Holland Code produced by a fair instrument from one produced by a loaded
   * one.
   */
  @Post('draft/publish')
  publish(
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<AdminAssessmentVersion> {
    return this.assessment.publish(actor.id, request.ip ?? null);
  }

  /** A published version, exactly as it was taken. Read-only by construction. */
  @Get('versions/:id')
  getVersion(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) assessmentId: string,
  ): Promise<AdminAssessmentDraft> {
    return this.assessment.getVersion(assessmentId);
  }
}
