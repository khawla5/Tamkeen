import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';

import type { AssignedPaths, PathDetail } from '@tamkeen/types';

import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { PathsService } from './paths.service';

@Controller('paths')
@Roles('EMPLOYEE')
export class PathsController {
  constructor(private readonly paths: PathsService) {}

  /** The paths assigned to this learner. Never a catalogue (D-130). */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<AssignedPaths> {
    return this.paths.listForUser(user.id);
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    /* Rejects a malformed id with a 400 before it reaches the database, where an
       invalid uuid would surface as a driver error rather than a bad request. */
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) pathId: string,
  ): Promise<PathDetail> {
    return this.paths.getDetail(user.id, pathId);
  }
}
