import { Global, Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { SettingsService } from './settings.service';

/**
 * The product knobs (§4C.6, D-072).
 *
 * `@Global`, like `AppConfigModule`, and for the same reason: the pass threshold
 * has consumers in four feature modules, and threading an import through each of
 * them would make "which module may read a setting" a question with an answer
 * that drifts. Configuration is genuinely cross-cutting.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
