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
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import type { AdminEnglishDraft, AdminEnglishOverview, AdminEnglishVersion } from '@tamkeen/types';

import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { AdminEnglishService } from './admin-english.service';
import {
  AddEnglishQuestionDto,
  ReorderEnglishDto,
  SetEnglishBandsDto,
  UpdateEnglishDraftDto,
  UpdateEnglishOptionDto,
  UpdateEnglishQuestionDto,
} from './admin-english.dto';

/**
 * §4C.9 — English placement management.
 *
 * **This is the only surface in the product that carries the English answer key
 * over the wire, and `@Roles('SUPER_ADMIN')` is the whole of what keeps it
 * there.** The learner's `GET /api/english-assessment` returns the same
 * questions without `isCorrect`, without `marks` and without each item's level;
 * an integration test greps that response for the field names this controller
 * returns.
 *
 * **Every write targets the draft.** There is no endpoint that edits a published
 * version, which is what makes D-049 structural rather than careful for the
 * second instrument too: the rows a past response points at have no route that
 * reaches them.
 *
 * A parallel controller to `AdminAssessmentController`, mounted on its own
 * path. Nothing here touches the RIASEC routes and nothing there touches these.
 */
@Controller('admin/english')
@Roles('SUPER_ADMIN')
export class AdminEnglishController {
  constructor(private readonly english: AdminEnglishService) {}

  /** What is live, what is being edited, and every version before it. */
  @Get()
  overview(): Promise<AdminEnglishOverview> {
    return this.english.overview();
  }

  @Get('draft')
  getDraft(): Promise<AdminEnglishDraft> {
    return this.english.getDraft();
  }

  /** Opens a draft as a deep copy of the active version — or as version 1. */
  @Post('draft')
  createDraft(
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<AdminEnglishDraft> {
    return this.english.createDraft(actor.id, request.ip ?? null);
  }

  @Delete('draft')
  @HttpCode(HttpStatus.NO_CONTENT)
  discardDraft(@CurrentUser() actor: AuthenticatedUser, @Req() request: Request): Promise<void> {
    return this.english.discardDraft(actor.id, request.ip ?? null);
  }

  @Patch('draft')
  updateDraft(@Body() dto: UpdateEnglishDraftDto): Promise<AdminEnglishDraft> {
    return this.english.updateDraft(dto);
  }

  @Post('draft/questions')
  addQuestion(@Body() dto: AddEnglishQuestionDto): Promise<AdminEnglishDraft> {
    return this.english.addQuestion(dto);
  }

  @Patch('draft/order')
  reorder(@Body() dto: ReorderEnglishDto): Promise<AdminEnglishDraft> {
    return this.english.reorder(dto.questionIds);
  }

  @Patch('draft/questions/:id')
  updateQuestion(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) questionId: string,
    @Body() dto: UpdateEnglishQuestionDto,
  ): Promise<AdminEnglishDraft> {
    return this.english.updateQuestion(questionId, dto);
  }

  @Delete('draft/questions/:id')
  removeQuestion(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) questionId: string,
  ): Promise<AdminEnglishDraft> {
    return this.english.removeQuestion(questionId);
  }

  /** Label, and which option is the right answer. */
  @Patch('draft/options/:id')
  updateOption(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) optionId: string,
    @Body() dto: UpdateEnglishOptionDto,
  ): Promise<AdminEnglishDraft> {
    return this.english.updateOption(optionId, dto);
  }

  /**
   * The configurable scoring rule (D-125) — the whole table, never one band.
   *
   * `PUT` rather than `PATCH`, and deliberately: this replaces the table
   * outright, and a partial update of a partition is not a coherent operation.
   */
  @Put('draft/bands')
  setBands(@Body() dto: SetEnglishBandsDto): Promise<AdminEnglishDraft> {
    return this.english.setBands(dto);
  }

  /**
   * Validates and activates the draft.
   *
   * A band table that is not a partition of the attainable range is refused here
   * and nowhere else — it is the last moment at which the fault is visible,
   * because nothing downstream distinguishes a level produced by a sound scale
   * from one produced by a broken table.
   */
  @Post('draft/publish')
  publish(
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<AdminEnglishVersion> {
    return this.english.publish(actor.id, request.ip ?? null);
  }

  /** A published version, exactly as it was taken. Read-only by construction. */
  @Get('versions/:id')
  getVersion(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) assessmentId: string,
  ): Promise<AdminEnglishDraft> {
    return this.english.getVersion(assessmentId);
  }
}
