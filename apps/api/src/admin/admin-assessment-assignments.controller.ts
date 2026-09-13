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

import type {
  AdminAssessmentAssignmentRow,
  AdminAssessmentGroupRow,
  AdminAssessmentKeyOption,
} from '@tamkeen/types';

import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { AdminAssessmentAssignmentsService } from './admin-assessment-assignments.service';
import {
  CreateAssessmentAssignmentDto,
  SaveAssessmentGroupDto,
  UpdateAssessmentAssignmentDto,
} from './admin.dto';

/**
 * §4C.3's Assignments tab (TAM-147) — assigning a typed instrument, or a
 * named group of them, to everyone, a department or a person.
 *
 * Two resources, one controller: an assignment names either an instrument's
 * key or a group's, and the group editor lives beside it because a group is
 * only ever authored to be assigned — there is no other screen that reads it.
 */
@Controller('admin')
@Roles('SUPER_ADMIN')
export class AdminAssessmentAssignmentsController {
  constructor(private readonly assignments: AdminAssessmentAssignmentsService) {}

  /** Every instrument/group key the create-assignment and group-editor
   *  pickers may offer, resolved server-side (§4C.3). */
  @Get('assessment-keys')
  listKeys(): Promise<AdminAssessmentKeyOption[]> {
    return this.assignments.listResolvable();
  }

  @Get('assessment-assignments')
  list(): Promise<AdminAssessmentAssignmentRow[]> {
    return this.assignments.list();
  }

  @Post('assessment-assignments')
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateAssessmentAssignmentDto,
    @Req() request: Request,
  ): Promise<AdminAssessmentAssignmentRow[]> {
    return this.assignments.create(dto, actor.id, request.ip ?? null);
  }

  @Patch('assessment-assignments/:id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() dto: UpdateAssessmentAssignmentDto,
    @Req() request: Request,
  ): Promise<AdminAssessmentAssignmentRow[]> {
    return this.assignments.update(id, dto, actor.id, request.ip ?? null);
  }

  @Delete('assessment-assignments/:id')
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Req() request: Request,
  ): Promise<AdminAssessmentAssignmentRow[]> {
    return this.assignments.remove(id, actor.id, request.ip ?? null);
  }

  @Get('assessment-groups')
  listGroups(): Promise<AdminAssessmentGroupRow[]> {
    return this.assignments.listGroups();
  }

  /** Creates or edits a group by its `key` (upsert, like the path editor). */
  @Put('assessment-groups')
  saveGroup(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SaveAssessmentGroupDto,
    @Req() request: Request,
  ): Promise<AdminAssessmentGroupRow[]> {
    return this.assignments.saveGroup(dto, actor.id, request.ip ?? null);
  }

  @Delete('assessment-groups/:id')
  @HttpCode(HttpStatus.OK)
  removeGroup(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Req() request: Request,
  ): Promise<AdminAssessmentGroupRow[]> {
    return this.assignments.removeGroup(id, actor.id, request.ip ?? null);
  }
}
