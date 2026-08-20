import { Module } from '@nestjs/common';

import { AppConfigModule } from '../config/app-config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EntityCoursesService } from './entity-courses.service';
import { EntityProfileService } from './entity-profile.service';
import { EntityScopeService } from './entity-scope.service';
import { EntityController } from './entity.controller';

/**
 * The entity / reviewer portal (§4B, Phase 4).
 *
 * `EntityScopeService` is exported because Phase 5's super-admin course
 * oversight (§4C.5) reads the same courses through the same scope — an admin is
 * simply an unscoped caller (D-062), and giving them a parallel query would be
 * the second implementation that eventually disagrees with this one.
 */
@Module({
  imports: [PrismaModule, AppConfigModule],
  controllers: [EntityController],
  providers: [EntityScopeService, EntityCoursesService, EntityProfileService],
  exports: [EntityScopeService],
})
export class EntityModule {}
