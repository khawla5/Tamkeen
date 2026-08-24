import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import {
  LoginDto,
  RegisterDto,
  RequestPasswordResetDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './auth.dto';
import { CurrentUser, Public } from './auth.decorators';
import { CSRF_COOKIE } from './csrf.guard';
import { SessionService, type AuthenticatedUser, type SessionContext } from './session.service';
import { generateToken } from '../common/secure-token';

/**
 * Authentication endpoints.
 *
 * Responses carry **codes, not prose** — the Arabic wording lives in the
 * frontend catalogue (D-024), so the API never returns user-facing text and the
 * two cannot drift.
 *
 * Every mutating endpoint here is throttled per IP on top of the global limit,
 * because these are the endpoints worth attacking.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  private contextOf(request: Request): SessionContext {
    return {
      ipAddress: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    };
  }

  /**
   * Issues the CSRF token the double-submit check expects.
   *
   * Readable by JavaScript on purpose: the frontend must echo it in a header,
   * which is exactly what a cross-site attacker cannot do (see CsrfGuard).
   */
  @Public()
  @Get('csrf')
  csrf(@Res({ passthrough: true }) response: Response): { csrfToken: string } {
    const token = generateToken();

    response.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });

    return { csrfToken: token };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  async register(@Body() dto: RegisterDto, @Req() request: Request): Promise<{ status: string }> {
    await this.auth.register(dto, this.contextOf(request));

    /* 202 with a neutral body: identical whether or not the address was already
       registered, so this cannot be used to enumerate accounts. */
    return { status: 'VERIFICATION_EMAIL_SENT' };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Req() request: Request,
  ): Promise<{ status: string }> {
    await this.auth.verifyEmail(dto.token, this.contextOf(request));

    return { status: 'EMAIL_VERIFIED' };
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  async resendVerification(@Body() dto: ResendVerificationDto): Promise<{ status: string }> {
    await this.auth.resendVerification(dto.email);

    return { status: 'VERIFICATION_EMAIL_SENT' };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(dto, this.contextOf(request));

    this.sessions.attach(response, result.token);

    /* The session token goes in the httpOnly cookie only — never in the body,
       where JavaScript (and therefore an XSS payload) could read it. */
    return { user: result.user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ status: string }> {
    if (!user) {
      throw new UnauthorizedException('AUTH_REQUIRED');
    }

    await this.auth.logout(user.sessionId, user.id, this.contextOf(request));
    this.sessions.clear(response);

    return { status: 'LOGGED_OUT' };
  }

  /** The signed-in user. Used by the frontend to establish session state. */
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser | undefined) {
    if (!user) {
      throw new UnauthorizedException('AUTH_REQUIRED');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      employeeId: user.employeeId,
      department: user.department,
      role: user.role,
    };
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(
    @Body() dto: RequestPasswordResetDto,
    @Req() request: Request,
  ): Promise<{ status: string }> {
    await this.auth.requestPasswordReset(dto.email, this.contextOf(request));

    /* Always the same response — an unknown address must be indistinguishable
       from a known one. */
    return { status: 'RESET_EMAIL_SENT' };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() request: Request,
  ): Promise<{ status: string }> {
    await this.auth.resetPassword(dto.token, dto.password, this.contextOf(request));

    return { status: 'PASSWORD_RESET' };
  }
}
