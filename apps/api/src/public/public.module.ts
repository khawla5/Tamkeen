import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { PublicController } from './public.controller';
import { PublicPathsService } from './public-paths.service';

/**
 * The unauthenticated surface (§4.0, TAM-150).
 *
 * One module rather than a public route hung off `PathsModule`, which is
 * `@Roles('EMPLOYEE')` at class level: a public route living next to guarded
 * ones is one refactor away from inheriting a guard it should not have, or
 * losing one it should. Keeping the whole of "what anyone may read" in a module
 * of its own makes the exposure a directory, not a decorator to notice.
 */
@Module({
  imports: [PrismaModule],
  controllers: [PublicController],
  providers: [PublicPathsService],
  exports: [PublicPathsService],
})
export class PublicModule {}
