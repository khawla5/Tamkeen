import { Test } from '@nestjs/testing';

import { AppConfigService } from '../config/app-config.module';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  async function build(options: { values?: Record<string, unknown>; dbFails?: boolean } = {}) {
    const values: Record<string, unknown> = {
      NODE_ENV: 'test',
      DEFAULT_LOCALE: 'ar',
      NUMBER_FORMAT: 'western',
      MOODLE_MODE: 'mock',
      ...options.values,
    };

    const prisma = {
      $queryRaw: options.dbFails
        ? jest
            .fn()
            .mockRejectedValue(
              new Error('connect ECONNREFUSED postgresql://user:password@localhost:5432'),
            )
        : jest.fn().mockResolvedValue([{ '1': 1 }]),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: AppConfigService, useValue: { get: (key: string) => values[key] } },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    return moduleRef.get(HealthController);
  }

  it('reports ok with the active cross-cutting config when the database is up', async () => {
    const controller = await build();

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      service: 'tamkeen-api',
      environment: 'test',
      locale: 'ar',
      numberFormat: 'western',
      moodleMode: 'mock',
      database: 'up',
    });
  });

  it('reports degraded rather than throwing when the database is unreachable', async () => {
    const controller = await build({ dbFails: true });
    const result = await controller.check();

    expect(result.status).toBe('degraded');
    expect(result.database).toBe('down');
  });

  it('never leaks the connection string from a driver error', async () => {
    const controller = await build({ dbFails: true });

    const serialised = JSON.stringify(await controller.check());
    expect(serialised).not.toContain('password');
    expect(serialised).not.toContain('5432');
  });

  it('exposes no secrets', async () => {
    const controller = await build({ values: { MOODLE_WS_TOKEN: 'super-secret' } });

    expect(JSON.stringify(await controller.check())).not.toContain('super-secret');
  });
});
