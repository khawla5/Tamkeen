import { Body, Controller, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';

import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { UpdateProfileDto } from './profile.dto';
import { ProfileService, type ProfileView } from './profile.service';

/** §4.12 — an employee's own profile. Separate from `AuthController`, which is
 *  about authenticating, not about the account it authenticates into. */
@Controller('me')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
    @Req() request: Request,
  ): Promise<ProfileView> {
    return this.profile.updateProfile(user.id, dto, request.ip ?? null);
  }
}
