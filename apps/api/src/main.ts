import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(AppConfigService);

  app.setGlobalPrefix('api');

  /* Security headers (§2 baseline). The API serves JSON only, so a restrictive
     CSP costs nothing here; the web app sets its own. */
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  /* Sessions and the CSRF double-submit check both read cookies. */
  app.use(cookieParser());

  // Input validation on every endpoint (CLAUDE.md §2 security baseline).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      /* Hide the class-validator internals in production; the frontend keys off
         the error codes, not the prose. */
      disableErrorMessages: config.isProduction,
    }),
  );

  /*
   * Credentialed CORS against exactly one origin in production. A wildcard is
   * not merely discouraged with credentials — browsers reject it — and echoing
   * back the request's Origin would defeat the point entirely.
   *
   * Outside production, a second fixed origin is allowed alongside APP_URL —
   * a developer running a throwaway preview server on another local port
   * (e.g. `next dev --port 3001`) still needs to reach the API. Still an
   * explicit allowlist, never a reflected/wildcard origin, so the security
   * property above holds; it just admits one more known local address.
   */
  app.enableCors({
    origin: config.isProduction
      ? config.get('APP_URL')
      : [config.get('APP_URL'), 'http://localhost:3001'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  });

  app.enableShutdownHooks();

  const port = config.get('API_PORT');
  await app.listen(port);

  new Logger('Bootstrap').log(`tamkeen-api listening on http://localhost:${port}/api`);
}

void bootstrap();
