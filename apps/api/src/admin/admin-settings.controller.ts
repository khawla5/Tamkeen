import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import type { AdminSettingsView } from '@tamkeen/types';

import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { SETTING_KEYS, type SettingKey } from '../settings/settings.schema';
import { AdminSettingsService } from './admin-settings.service';
import { UpdateSettingDto } from './admin.dto';

/**
 * §4C.6 — system settings.
 *
 * **The key is a path parameter validated against a fixed list, not free text.**
 * A settings endpoint that accepts any key is one that writes any row, and the
 * table it writes to is read by the pass-threshold evaluator and the
 * registration gate. `SETTING_KEYS` is the whole allow-list, and a key outside
 * it is a 404 rather than a row nobody meant to create.
 *
 * There is no endpoint for the secrets, and none for the read-only floors — the
 * bounds and the rate limits appear in the view and have nowhere to be sent.
 */
@Controller('admin/settings')
@Roles('SUPER_ADMIN')
export class AdminSettingsController {
  constructor(private readonly settings: AdminSettingsService) {}

  @Get()
  view(): Promise<AdminSettingsView> {
    return this.settings.view();
  }

  @Patch(':key')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @Req() request: Request,
  ): Promise<AdminSettingsView> {
    return this.settings.update(assertKey(key), dto.value, actor.id, request.ip ?? null);
  }

  /** Returns a knob to the environment's value. */
  @Delete(':key')
  reset(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('key') key: string,
    @Req() request: Request,
  ): Promise<AdminSettingsView> {
    return this.settings.reset(assertKey(key), actor.id, request.ip ?? null);
  }
}

/**
 * Narrows a path parameter to a known setting.
 *
 * A 404 rather than a 400: an unknown key is not a malformed request, it is a
 * request for something that does not exist — and answering "not found" says
 * nothing about which keys do.
 */
function assertKey(key: string): SettingKey {
  if (!(SETTING_KEYS as readonly string[]).includes(key)) {
    throw new NotFoundException('SETTING_NOT_FOUND');
  }

  return key as SettingKey;
}
