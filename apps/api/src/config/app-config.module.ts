import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { validateEnv, type Env } from './env.schema';

/**
 * Typed configuration access. Feature modules inject `AppConfigService` and get
 * a fully validated, typed `Env` — no `process.env` reads outside this module.
 */
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true }) as Env[K];
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }
}

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Root .env so both apps read one file in local development.
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
  ],
  providers: [
    {
      provide: AppConfigService,
      useFactory: (config: ConfigService<Env, true>) => new AppConfigService(config),
      inject: [ConfigService],
    },
  ],
  exports: [AppConfigService],
})
export class AppConfigModule {}
