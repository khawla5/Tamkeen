import { Module } from '@nestjs/common';

import { JourneyModule } from '../journey/journey.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PathsController } from './paths.controller';
import { PathsService } from './paths.service';

@Module({
  imports: [PrismaModule, JourneyModule],
  controllers: [PathsController],
  providers: [PathsService],
})
export class PathsModule {}
