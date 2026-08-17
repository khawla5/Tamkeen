import { Controller, Get, Inject } from '@nestjs/common';

import { Public } from '../auth/auth.decorators';
import { AppConfigService } from '../config/app-config.module';
import { LMS_PORT, type LmsPort } from '../moodle/lms.port';
import { PrismaService } from '../prisma/prisma.service';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: 'tamkeen-api';
  environment: string;
  locale: string;
  numberFormat: string;
  moodleMode: string;
  database: 'up' | 'down';
  lms: 'up' | 'down';
  lmsSiteName?: string;
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    /* Injected as LMS_PORT, not as a concrete class — this controller does not
       know whether it is talking to the mock or a real Moodle. */
    @Inject(LMS_PORT) private readonly lms: LmsPort,
  ) {}

  /**
   * Liveness plus a read-out of the cross-cutting config, so a reviewer can
   * confirm the Arabic-first defaults and the Moodle mode without shelling into
   * a container. Deliberately exposes no secrets and no connection strings.
   *
   * Public because a liveness probe cannot hold a session — which is also why it
   * must never grow to return anything an anonymous caller should not see.
   */
  @Public()
  @Get()
  async check(): Promise<HealthResponse> {
    const [database, lmsHealth] = await Promise.all([this.checkDatabase(), this.lms.checkHealth()]);

    return {
      /* The LMS being down does not make the app unhealthy — the catalogue is
         cached in our own database and only course entry is affected. It is
         reported so an operator can see it, not to fail the liveness probe. */
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'tamkeen-api',
      environment: this.config.get('NODE_ENV'),
      locale: this.config.get('DEFAULT_LOCALE'),
      numberFormat: this.config.get('NUMBER_FORMAT'),
      moodleMode: this.config.get('MOODLE_MODE'),
      database,
      lms: lmsHealth.reachable ? 'up' : 'down',
      ...(lmsHealth.siteName ? { lmsSiteName: lmsHealth.siteName } : {}),
    };
  }

  private async checkDatabase(): Promise<'up' | 'down'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      /* Swallow the driver error on purpose: it can contain the host, port and
         user from the connection string, which must not reach an HTTP response. */
      return 'down';
    }
  }
}
