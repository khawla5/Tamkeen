import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.module';
import { PrismaService } from '../prisma/prisma.service';
import { SETTING_KEYS, parseSetting, type SettingKey, type SettingValues } from './settings.schema';

/**
 * The product knobs, database-backed with the environment as the default
 * (§4C.6, D-072).
 *
 * **Every consumer reads through this, and that is the whole point.** The pass
 * threshold alone has four callers — completion sync, the course player, the
 * entity course view and the verdict evaluator — and before this they each read
 * `config.get('PASS_THRESHOLD')` directly. Four independent readers of one
 * number is three chances to disagree, and the disagreement would show up as a
 * learner told they passed on one screen and failed on another.
 *
 * **An absent row means the environment.** So a fresh deployment behaves exactly
 * as it did before the table existed, `.env.example` stays meaningful as
 * documentation of the defaults, and an administrator's first save is what
 * starts overriding. A malformed row — hand-edited, or written by an older
 * version — falls back the same way and is logged, because refusing to boot over
 * one bad setting would take the product down for something the portal can fix.
 *
 * **Secrets never come from here.** The Moodle token, the database URL and the
 * SMTP credentials stay environment-only; a setting readable by the screen that
 * edits it is a setting that appears in a network response.
 *
 * Values are cached for a few seconds rather than read per call: completion sync
 * asks for the threshold once per learner per run, and a database round trip for
 * a number that changes twice a year is not a good trade. The window is short
 * enough that an administrator's change takes effect while they are still
 * looking at the screen.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  /** Short — see the class comment. Not configurable; that way lies recursion. */
  private static readonly CACHE_MS = 5_000;

  private cache = new Map<SettingKey, unknown>();
  private cachedAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * The effective value: the stored one if there is a valid one, else the
   * environment's.
   *
   * Typed from `Env`, so a caller gets the same type it got from `config.get`
   * and the swap is invisible at every call site.
   */
  async get<K extends SettingKey>(key: K): Promise<SettingValues[K]> {
    await this.refreshIfStale();

    const stored = this.cache.get(key);

    return (stored === undefined ? this.config.get(key) : stored) as SettingValues[K];
  }

  /** Every knob, for §4C.6's screen. */
  async all(): Promise<Record<SettingKey, unknown>> {
    await this.refreshIfStale();

    return Object.fromEntries(
      SETTING_KEYS.map((key) => [key, this.cache.get(key) ?? this.config.get(key)]),
    ) as Record<SettingKey, unknown>;
  }

  /** Which of them an administrator has overridden, for "reset to default". */
  async overridden(): Promise<SettingKey[]> {
    await this.refreshIfStale();

    return SETTING_KEYS.filter((key) => this.cache.has(key));
  }

  /**
   * Writes a setting, having validated it.
   *
   * The value is stored as text and parsed on the way in, so a row that reaches
   * the table is one every consumer can already use. Invalid input is refused
   * here rather than at the next read, where it would surface as a fallback
   * nobody asked for.
   */
  async set(key: SettingKey, raw: string, actorId: string): Promise<void> {
    /* Throws on invalid input; the controller turns it into a 400 with the
       setting's own code so the message names the knob, not "validation". */
    parseSetting(key, raw);

    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value: raw, updatedByUserId: actorId },
      update: { value: raw, updatedByUserId: actorId },
    });

    this.invalidate();
  }

  /** Removes an override, returning the knob to the environment's value. */
  async reset(key: SettingKey): Promise<void> {
    await this.prisma.setting.deleteMany({ where: { key } });

    this.invalidate();
  }

  /** Forces the next read to hit the database. Called after every write. */
  invalidate(): void {
    this.cachedAt = 0;
  }

  private async refreshIfStale(): Promise<void> {
    if (Date.now() - this.cachedAt < SettingsService.CACHE_MS) {
      return;
    }

    const rows = await this.prisma.setting.findMany({ select: { key: true, value: true } });
    const next = new Map<SettingKey, unknown>();

    for (const row of rows) {
      if (!(SETTING_KEYS as readonly string[]).includes(row.key)) {
        /* A key this version does not know — left from a newer deployment, or
           hand-inserted. Ignored rather than deleted: it is not ours to remove,
           and it costs nothing to leave alone. */
        continue;
      }

      try {
        next.set(row.key as SettingKey, parseSetting(row.key as SettingKey, row.value));
      } catch {
        /* Falls back to the environment, loudly. Refusing to serve because one
           setting is malformed would take the product down over something the
           portal can fix in a click. */
        this.logger.error(`Setting "${row.key}" is invalid; using the environment value`);
      }
    }

    this.cache = next;
    this.cachedAt = Date.now();
  }
}
