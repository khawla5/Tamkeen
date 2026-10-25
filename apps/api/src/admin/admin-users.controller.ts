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
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import type {
  AdminEntityRow,
  AdminInviteResult,
  AdminRegistrationPolicyView,
  AdminUserDetail,
  AdminUserPage,
  AdminUserRow,
} from '@tamkeen/types';

import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { AdminEntitiesService } from './admin-entities.service';
import { AdminUsersService } from './admin-users.service';
import {
  AdminEntityQueryDto,
  AdminUserQueryDto,
  CreateAdminEntityDto,
  CreateAdminUserDto,
  SetUserDepartmentDto,
  SetUserStatusDto,
  UpdateAdminEntityDto,
} from './admin.dto';

/**
 * §4C.2 — user and organisation management.
 *
 * `@Roles('SUPER_ADMIN')` at class level, as on every admin controller, so a
 * handler added later inherits it. `admin-rbac.e2e-spec.ts` reflects the routes
 * off `ADMIN_CONTROLLERS` and asserts all four callers against each, which is
 * what makes that inheritance provable rather than assumed.
 *
 * **There is no delete endpoint for either resource.** A user carries an audit
 * trail and possibly certificates that must stay resolvable; an organisation
 * with courses cannot be removed by the schema at all (D-063). Suspension is the
 * operational answer to both, and it is complete: a suspended account's sessions
 * are revoked and every future request refused, and a suspended organisation's
 * accounts are refused by the scope resolver.
 */
@Controller('admin')
@Roles('SUPER_ADMIN')
export class AdminUsersController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly entities: AdminEntitiesService,
  ) {}

  @Get('users')
  listUsers(@Query() query: AdminUserQueryDto): Promise<AdminUserPage> {
    return this.users.list(query);
  }

  /** The rules governing self-registration (D-017); editable in §4C.6. */
  @Get('registration-policy')
  registrationPolicy(): AdminRegistrationPolicyView {
    return this.users.registrationPolicy();
  }

  @Get('users/:id')
  getUser(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) userId: string,
  ): Promise<AdminUserDetail> {
    return this.users.get(userId);
  }

  /** Provisions an account and emails its invitation. Returns no password. */
  @Post('users')
  createUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateAdminUserDto,
    @Req() request: Request,
  ): Promise<AdminInviteResult> {
    return this.users.create(dto, actor.id, request.ip ?? null);
  }

  @Post('users/:id/invite')
  reinvite(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) userId: string,
    @Req() request: Request,
  ): Promise<AdminInviteResult> {
    return this.users.reinvite(userId, actor.id, request.ip ?? null);
  }

  /*
   * Status and role are separate endpoints rather than one PATCH over a partial
   * body. They are different decisions with different refusals and different
   * audit actions, and an incident review asks them as different questions:
   * "who cut this person off" is not "who gave them this access".
   */
  @Patch('users/:id/status')
  setStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) userId: string,
    @Body() dto: SetUserStatusDto,
    @Req() request: Request,
  ): Promise<AdminUserRow> {
    return this.users.setStatus(userId, dto.status, actor.id, request.ip ?? null);
  }

  /** Deletes the account for good; suspending is the reversible alternative. */
  @Delete('users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) userId: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.users.remove(userId, actor.id, request.ip ?? null);
  }

  /** An account's department, and nothing else about it. */
  @Patch('users/:id/department')
  setDepartment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) userId: string,
    @Body() dto: SetUserDepartmentDto,
    @Req() request: Request,
  ): Promise<AdminUserRow> {
    return this.users.setDepartment(userId, dto.department.trim(), actor.id, request.ip ?? null);
  }

  @Get('entities')
  listEntities(@Query() query: AdminEntityQueryDto): Promise<AdminEntityRow[]> {
    return this.entities.list(query.q);
  }

  @Post('entities')
  createEntity(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateAdminEntityDto,
    @Req() request: Request,
  ): Promise<AdminEntityRow> {
    return this.entities.create(dto, actor.id, request.ip ?? null);
  }

  @Patch('entities/:id')
  updateEntity(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) entityId: string,
    @Body() dto: UpdateAdminEntityDto,
    @Req() request: Request,
  ): Promise<AdminEntityRow> {
    return this.entities.update(entityId, dto, actor.id, request.ip ?? null);
  }
}
