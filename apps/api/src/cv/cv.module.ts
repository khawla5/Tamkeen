import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { CvController } from './cv.controller';
import { CvService } from './cv.service';

/** The CV builder (§4.11, Phase 3). */
@Module({
  imports: [PrismaModule],
  controllers: [CvController],
  providers: [CvService],
  exports: [CvService],
})
export class CvModule {}
