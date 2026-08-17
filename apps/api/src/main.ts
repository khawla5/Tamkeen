import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(AppConfigService);

  app.setGlobalPrefix('api');

  // Input validation on every endpoint (CLAUDE.md §2 security baseline).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: config.get('APP_URL'),
    credentials: true,
  });

  const port = config.get('API_PORT');
  await app.listen(port);

  new Logger('Bootstrap').log(`tamkeen-api listening on http://localhost:${port}/api`);
}

void bootstrap();
