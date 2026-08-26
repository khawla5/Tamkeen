import { BadRequestException, Injectable } from '@nestjs/common';

import {
  PATH_MAX_COURSES,
  PATH_MIN_COURSES,
  SETTING_KEYS,
  type AdminSettingsView,
  type SettingKey,
} from '@tamkeen/types';

import { AuditAction } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.module';
import { formatSetting, parseSetting, settingEditor } from '../settings/settings.schema';
import { SettingsService } from '../settings/settings.service';
import { SyncSchedulerService } from '../sync-scheduler/sync-scheduler.service';

/**
 * §4C.6 — the product knobs.
 *
 * **What this can change, and what it deliberately cannot.** It writes the
 * settings `SETTING_KEYS` lists: the sync interval, the registration gate, the
 * digits default, the Moodle address and the certificate signature block. It
 * shows, and refuses to write, the two things §2 makes rules rather than knobs —
 * the 5-10 path bounds (D-074) and the auth rate limits, which are security
 * floors. It has no vocabulary at all for the secrets, which never leave the
 * environment (D-072). And since the ministry's 2026-08-25 direction it has none
 * for the **pass threshold** either: that is deployment configuration now, read
 * straight from the environment, and there is no endpoint that can move it
 * (D-102).
 *
 * **A changed interval re-registers the scheduler.** BullMQ holds a repeatable
 * job registered at boot; without re-registering, an administrator lowering the
 * interval would see the setting change and the polling not. The scheduler
 * upserts on a fixed job id, so re-registering replaces the schedule rather than
 * adding a second one that doubles the rate.
 */
@Injectable()
export class AdminSettingsService {
  constructor(
    private readonly settings: SettingsService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly scheduler: SyncSchedulerService,
  ) {}

  async view(): Promise<AdminSettingsView> {
    const [values, overridden] = await Promise.all([
      this.settings.all(),
      this.settings.overridden(),
    ]);

    return {
      settings: SETTING_KEYS.map((key) => ({
        key,
        value: formatSetting(key, values[key]),
        isOverridden: overridden.includes(key),
        /* Read off the validating schema, so the screen's field and the
           server's rule are the same statement (TAM-135). */
        ...settingEditor(key),
      })),
      /*
       * Shown, never written. An administrator explaining why a path build was
       * refused needs the bounds; nobody needs a control that lowers the floor
       * of five, and a rate limit an operator can loosen is not a limit.
       */
      readOnly: [
        { key: 'PATH_MIN_COURSES', value: String(PATH_MIN_COURSES) },
        { key: 'PATH_MAX_COURSES', value: String(PATH_MAX_COURSES) },
        {
          key: 'API_RATE_LIMIT_MAX_REQUESTS',
          value: String(this.config.get('API_RATE_LIMIT_MAX_REQUESTS')),
        },
        {
          key: 'API_RATE_LIMIT_WINDOW_SECONDS',
          value: String(this.config.get('API_RATE_LIMIT_WINDOW_SECONDS')),
        },
      ],
    };
  }

  async update(
    key: SettingKey,
    value: string,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminSettingsView> {
    try {
      parseSetting(key, value);
    } catch {
      /* Named by its own key, so the message can say which knob was rejected
         rather than "validation failed". */
      throw new BadRequestException(`SETTING_INVALID_${key}`);
    }

    await this.settings.set(key, value, actorId);
    await this.afterChange(key);

    await this.audit.record({
      action: AuditAction.ADMIN_SETTING_CHANGED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'setting',
      targetId: key,
      /*
       * The key and the new value, which is the one case where recording a
       * value is right: these are product configuration, not anybody's data, and
       * "who lowered the pass threshold, to what, and when" is the question an
       * audit of a disputed certificate would start from. No secret is in this
       * list, which is what makes it safe to record at all.
       */
      detail: { setting: key, value },
    });

    return this.view();
  }

  async reset(
    key: SettingKey,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminSettingsView> {
    await this.settings.reset(key);
    await this.afterChange(key);

    await this.audit.record({
      action: AuditAction.ADMIN_SETTING_RESET,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'setting',
      targetId: key,
      detail: { setting: key },
    });

    return this.view();
  }

  /** What a given setting needs doing beyond being stored. */
  private async afterChange(key: SettingKey): Promise<void> {
    if (key === 'COMPLETION_SYNC_INTERVAL_MINUTES') {
      await this.scheduler.applyIntervalChange();
    }
  }
}
