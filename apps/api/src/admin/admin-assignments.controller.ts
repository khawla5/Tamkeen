import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import type { AdminAssignResult } from '@tamkeen/types';

import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { AdminAssignmentsService } from './admin-assignments.service';
import { AssignAssessmentDto } from './admin-assignments.dto';

/**
 * §4C.2 — assessment assignment (D-130/D-132/D-133). The write half only:
 * who may take which instrument is decided from the manage-account panel in
 * «الحسابات», which reads a person's assignments off `GET /admin/users/:id`
 * and writes through these two routes. The rules live in the service; the
 * RBAC suite covers the routes via `ADMIN_CONTROLLERS`.
 */
@Controller('admin/assignments')
@Roles('SUPER_ADMIN')
export class AdminAssignmentsController {
  constructor(private readonly assignments: AdminAssignmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  assign(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: AssignAssessmentDto,
    @Req() request: Request,
  ): Promise<AdminAssignResult> {
    return this.assignments.assign(dto.instrument, dto.userIds, actor.id, request.ip ?? null);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.assignments.revoke(id, actor.id, request.ip ?? null);
  }
}
