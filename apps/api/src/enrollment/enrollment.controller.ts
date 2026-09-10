import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import type { DashboardView, MyPathView } from '@tamkeen/types';

import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { EnrollmentService } from './enrollment.service';

/**
 * §4.9 / §4.2. Every rule lives in the service; these methods only carry the
 * request in and the view out.
 *
 * **Read-only, all of it.** Selecting a path, setting its courses and confirming
 * were the four write endpoints here, and D-134 removed the decisions they
 * carried: the ministry assigns the path (§4C.2) and the assessment decides
 * where in it a learner starts (§4.3).
 */
@Controller('my-path')
@Roles('EMPLOYEE')
export class EnrollmentController {
  constructor(private readonly enrollment: EnrollmentService) {}

  /**
   * The learner's paths. Null rather than 404 for somebody holding none — "no
   * path yet" is a normal state, not a failure.
   */
  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query('pathId') pathId?: string,
  ): Promise<MyPathView | null> {
    return this.enrollment.getMyPath(user.id, pathId);
  }

  /** Every assigned path at once, for the screen that lists them. */
  @Get('all')
  list(@CurrentUser() user: AuthenticatedUser): Promise<MyPathView[]> {
    return this.enrollment.listMyPaths(user.id);
  }

  @Get(':pathId')
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pathId', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) pathId: string,
  ): Promise<MyPathView | null> {
    return this.enrollment.getMyPath(user.id, pathId);
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
