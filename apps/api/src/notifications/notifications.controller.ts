import { Controller, Get, HttpCode, Post } from '@nestjs/common';

import type { UnreadNotificationsView } from '@tamkeen/types';

import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { NotificationsService } from './notifications.service';

/** The in-app indicator (§2). Authenticated, and scoped to the caller. */
@Controller('notifications')
@Roles('EMPLOYEE')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('unread')
  unread(@CurrentUser() user: AuthenticatedUser): Promise<UnreadNotificationsView> {
    return this.notifications.unread(user.id);
  }

  /**
   * Marks certificate notifications seen.
   *
   * **POST, not GET**, even though it reads like part of loading the gallery:
   * it changes state, so it must not be prefetched by a browser or replayed
   * from a cache, and as a POST it carries the CSRF token every mutating
   * request does. 204 because there is nothing useful to return — the caller
   * re-reads the count.
   */
  @Post('certificates/read')
  @HttpCode(204)
  async markCertificatesRead(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.notifications.markCertificatesRead(user.id);
  }
}
