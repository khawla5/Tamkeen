import { Global, Logger, Module } from '@nestjs/common';

import { AppConfigModule, AppConfigService } from '../config/app-config.module';
import { LMS_PORT, type LmsPort } from './lms.port';
import { MockLmsService } from './mock/mock-lms.service';
import { MoodleHttpService } from './real/moodle-http.service';
import { MoodleWsClient } from './real/moodle-ws.client';

/**
 * The LMS module — the single place that knows an LMS exists (CLAUDE.md §2A).
 *
 * `MOODLE_MODE` selects the implementation. Callers inject `LMS_PORT` and never
 * learn which one they got, which is what makes the Phase 2 swap a change to
 * this file plus one class body, and nothing else.
 *
 * `MockLmsService` is also exported concretely, so tests and development seeding
 * can reach its simulation helpers. Application code must inject `LMS_PORT` —
 * anything injecting `MockLmsService` outside a test would break in Phase 2, and
 * is easy to grep for.
 */
@Global()
@Module({
  /* AppConfigModule is @Global, so this import is not strictly required at
     runtime — but declaring it makes the dependency explicit and lets this module
     be compiled in isolation under test. Implicit reliance on globalness is what
     turns a unit test into a whole-application boot. */
  imports: [AppConfigModule],
  providers: [
    MockLmsService,
    {
      provide: LMS_PORT,
      inject: [AppConfigService, MockLmsService],
      useFactory: (config: AppConfigService, mock: MockLmsService): LmsPort => {
        const logger = new Logger('LmsModule');

        if (config.get('MOODLE_MODE') === 'real') {
          const baseUrl = config.get('MOODLE_BASE_URL');

          /* validateEnv already refuses MOODLE_MODE=real without a base URL and
             a token, so this is defence in depth rather than the primary check.
             The URL is safe to log; the token is not, and is never logged
             anywhere. */
          logger.log(`LMS mode: real (${baseUrl})`);

          return new MoodleHttpService(
            baseUrl,
            new MoodleWsClient({
              baseUrl,
              token: config.get('MOODLE_WS_TOKEN'),
              timeoutMs: config.get('MOODLE_TIMEOUT_MS'),
            }),
            config.get('MOODLE_STUDENT_ROLE_ID'),
          );
        }

        logger.log('LMS mode: mock');

        return mock;
      },
    },
  ],
  exports: [LMS_PORT, MockLmsService],
})
export class MoodleModule {}
