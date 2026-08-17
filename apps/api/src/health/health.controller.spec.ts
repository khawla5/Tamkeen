import { Test } from '@nestjs/testing';

import { AppConfigService } from '../config/app-config.module';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  async function build(overrides: Record<string, unknown> = {}) {
    const values: Record<string, unknown> = {
      NODE_ENV: 'test',
      DEFAULT_LOCALE: 'ar',
      NUMBER_FORMAT: 'western',
      MOODLE_MODE: 'mock',
      ...overrides,
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: AppConfigService, useValue: { get: (key: string) => values[key] } }],
    }).compile();

    return moduleRef.get(HealthController);
  }

  it('reports ok with the active cross-cutting config', async () => {
    const controller = await build();

    expect(controller.check()).toEqual({
      status: 'ok',
      service: 'tamkeen-api',
      environment: 'test',
      locale: 'ar',
      numberFormat: 'western',
      moodleMode: 'mock',
    });
  });

  it('exposes no secrets', async () => {
    const controller = await build({ MOODLE_WS_TOKEN: 'super-secret' });

    expect(JSON.stringify(controller.check())).not.toContain('super-secret');
  });
});
