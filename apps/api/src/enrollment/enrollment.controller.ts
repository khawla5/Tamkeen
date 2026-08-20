import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';

import type { DashboardView, MyPathView } from '@tamkeen/types';

import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { AddPathCourseDto, SelectPathDto, SetPathCoursesDto } from './enrollment.dto';
import { EnrollmentService } from './enrollment.service';

/**
 * §4.5 / §4.9. Every rule lives in the service; these methods only carry the
 * request in and the view out.
 */
@Controller('my-path')
@Roles('EMPLOYEE')
export class EnrollmentController {
  constructor(private readonly enrollment: EnrollmentService) {}

  /** Null rather than 404 — "no path yet" is a normal state, not a failure. */
  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<MyPathView | null> {
    return this.enrollment.getMyPath(user.id);
  }

  @Post('select')
  @HttpCode(HttpStatus.NO_CONTENT)
  select(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SelectPathDto,
    @Req() request: Request,
  ): Promise<void> {
    return this.enrollment.selectPath(user.id, dto.pathId, request.ip ?? null);
  }

  /** Replaces the selection wholesale — the build page sends what is ticked. */
  @Put('courses')
  @HttpCode(HttpStatus.OK)
  async setCourses(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetPathCoursesDto,
    @Req() request: Request,
  ): Promise<{ selectedCourseIds: string[] }> {
    const selectedCourseIds = await this.enrollment.setCourses(
      user.id,
      dto.courseIds,
      request.ip ?? null,
    );

    return { selectedCourseIds };
  }

  /** §4.9's quiet post-commitment add. */
  @Post('courses')
  @HttpCode(HttpStatus.NO_CONTENT)
  addCourse(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddPathCourseDto,
    @Req() request: Request,
  ): Promise<void> {
    return this.enrollment.addCourse(user.id, dto.courseId, request.ip ?? null);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@CurrentUser() user: AuthenticatedUser, @Req() request: Request): Promise<MyPathView> {
    return this.enrollment.confirm(user.id, request.ip ?? null);
  }
}

@Controller('dashboard')
@Roles('EMPLOYEE')
export class DashboardController {
  constructor(private readonly enrollment: EnrollmentService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<DashboardView> {
    return this.enrollment.getDashboard(user.id);
  }
}
