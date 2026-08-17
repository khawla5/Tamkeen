import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import type { CourseDetail, CourseSummary } from '@tamkeen/types';

import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { CourseQueryDto } from './courses.dto';
import { CoursesService } from './courses.service';

/**
 * §4.6 / §4.7.
 *
 * Authenticated, like everything else — "available even pre-assessment" means
 * before taking the assessment, not before signing in. This is an internal
 * ministry system; there is no anonymous browsing of it.
 */
@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CourseQueryDto,
  ): Promise<CourseSummary[]> {
    return this.courses.list(user.id, query);
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) courseId: string,
  ): Promise<CourseDetail> {
    return this.courses.getDetail(user.id, courseId);
  }
}
