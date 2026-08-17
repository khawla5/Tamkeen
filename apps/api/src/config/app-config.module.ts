import { Global, Module } from '@nestjs/common';
import { config as loadEnv } from 'dotenv';

import { validateEnv, type Env } from './env.schema';

/**
 * Typed configuration. Feature modules inject `AppConfigService` and get a fully
 * validated, correctly *typed* `Env` — no `process.env` reads anywhere else.
 *
 * Deliberately does not use `@nestjs/config`. Its `ConfigService.get()` consults
 * `process.env` in preference to the object returned by `validate`, so every
 * value arrives as the raw string the environment held rather than the parsed
 * type. That is not a cosmetic problem:
 *
 *   - `ALLOWED_EMAIL_DOMAINS` came back as `"a.gov,b.gov"` instead of an array,
 *     turning the registration domain check into a **substring match** — so
 *     `ministry.gov` would have satisfied a gate configured for
 *     `ministry.gov.example`. That is a real authentication bypass.
 *   - `RATE_LIMIT_ENABLED=false` came back as the string `"false"`, which is
 *     truthy, so a boolean switch silently did nothing.
 *   - Numeric settings came back as strings, so arithmetic on them would
 *     concatenate.
 *
 * Holding the validated object and reading straight from it removes the whole
 * class of bug, and costs one small class.
 */
export class AppConfigService {
  private readonly env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  get<K extends keyof Env>(key: K): Env[K] {
    return this.env[key];
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }
}

@Global()
@Module({
  providers: [
    {
      provide: AppConfigService,
      useFactory: () => {
        /* Root .env so both apps read one file locally. dotenv does not override
           variables already present, so an explicitly-set value (a container's
           configuration, or a test) always wins over the file. */
        loadEnv({ path: ['.env', '../../.env'], quiet: true });

        return new AppConfigService(validateEnv(process.env));
      },
    },
  ],
  exports: [AppConfigService],
})
export class AppConfigModule {}
