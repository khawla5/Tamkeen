import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { MoodleModule } from '../moodle/moodle.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [PrismaModule, AuditModule, MoodleModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
