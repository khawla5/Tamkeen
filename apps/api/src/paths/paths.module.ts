import { Module } from '@nestjs/common';

import { JourneyModule } from '../journey/journey.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PathsController } from './paths.controller';
import { PathsService } from './paths.service';
import { PublicPathsController } from './public-paths.controller';
import { PublicPathsService } from './public-paths.service';

@Module({
  imports: [PrismaModule, JourneyModule],
  controllers: [PathsController, PublicPathsController],
  providers: [PathsService, PublicPathsService],
})
export class PathsModule {}
