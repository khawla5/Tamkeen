import { Module } from '@nestjs/common';

import { MoodleModule } from '../moodle/moodle.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

@Module({
  imports: [MoodleModule],
  controllers: [AuthController],
  providers: [AuthService, SessionService],
  exports: [SessionService],
})
export class AuthModule {}
