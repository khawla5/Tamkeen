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
import { AdminPathAssignmentsService } from './admin-path-assignments.service';
import { AssignPathDto } from './admin.dto';

const uuid = () => new ParseUUIDPipe({ errorHttpStatusCode: 400 });

/**
 * §4C.2 — which paths an employee is on (D-130/D-133/D-134).
 *
 * Two write routes and no read: the manage-account panel gets the assignments
 * from `GET /admin/users/:id`, which is where the rest of what it shows already
 * comes from. A second read endpoint would be a second answer to the same
 * question.
 */
@Controller('admin/path-assignments')
@Roles('SUPER_ADMIN')
export class AdminPathAssignmentsController {
  constructor(private readonly assignments: AdminPathAssignmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AssignPathDto,
    @Req() request: Request,
  ): Promise<AdminAssignResult> {
    return this.assignments.assign(dto, user.id, request.ip ?? null);
  }

  @Delete(':userId/:pathId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', uuid()) userId: string,
    @Param('pathId', uuid()) pathId: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.assignments.revoke(userId, pathId, actor.id, request.ip ?? null);
  }
}
