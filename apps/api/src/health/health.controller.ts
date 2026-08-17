import { Controller, Get } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.module';

export interface HealthResponse {
  status: 'ok';
  service: 'tamkeen-api';
  environment: string;
  locale: string;
  numberFormat: string;
  moodleMode: string;
}

@Controller('health')
export class HealthController {
  constructor(private readonly config: AppConfigService) {}

  /**
   * Liveness + a read-out of the cross-cutting config choices, so a reviewer
   * can confirm the Arabic-first defaults and the Moodle mode without shelling
   * into the container. Deliberately exposes no secrets.
   */
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      service: 'tamkeen-api',
      environment: this.config.get('NODE_ENV'),
      locale: this.config.get('DEFAULT_LOCALE'),
      numberFormat: this.config.get('NUMBER_FORMAT'),
      moodleMode: this.config.get('MOODLE_MODE'),
    };
  }
}
