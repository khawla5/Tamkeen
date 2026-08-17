import { PrismaPg } from '@prisma/adapter-pg';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { PrismaClient } from '../../generated/prisma';

/**
 * The database client, tied to the Nest lifecycle so connections open on boot
 * and close cleanly on shutdown rather than being left to the garbage collector.
 *
 * Prisma 7 connects through a driver adapter rather than a URL in the schema
 * (D-026), so the pg pool is constructed here and handed to the client.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      /* Fail at boot with a clear message rather than on the first query with
         an opaque driver error. */
      throw new Error('DATABASE_URL is not set — the API cannot start without a database.');
    }

    super({
      adapter: new PrismaPg({ connectionString }),
      /* Never log `query` in production: parameters carry credentials and PII,
         and §2 forbids PII in logs. */
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
