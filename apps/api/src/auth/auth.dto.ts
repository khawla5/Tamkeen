import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Request shapes. The global ValidationPipe runs with `whitelist` and
 * `forbidNonWhitelisted`, so any property not declared here is rejected rather
 * than silently ignored — no mass-assignment surface.
 *
 * Emails are normalised to lower case at the edge, so "Ahmad@…" and "ahmad@…"
 * cannot become two accounts.
 */
const normaliseEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

/** Upper bound on password length: argon2 is memory-hard, so an unbounded
 *  password is a cheap way to make the server do expensive work. */
const MAX_PASSWORD = 128;

export class RegisterDto {
  @IsEmail({}, { message: 'EMAIL_INVALID' })
  @MaxLength(254)
  @normaliseEmail()
  email!: string;

  /* Minimum length is also checked in the service against PASSWORD_MIN_LENGTH,
     which is configurable; 8 here is the absolute floor a request must clear. */
  @IsString()
  @MinLength(8, { message: 'PASSWORD_TOO_SHORT' })
  @MaxLength(MAX_PASSWORD, { message: 'PASSWORD_TOO_LONG' })
  password!: string;

  @IsString()
  @IsNotEmpty({ message: 'FULL_NAME_REQUIRED' })
  @MaxLength(120)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  fullName!: string;

  @IsString()
  @IsNotEmpty({ message: 'EMPLOYEE_ID_REQUIRED' })
  @MaxLength(40)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  employeeId!: string;

  @IsString()
  @IsNotEmpty({ message: 'DEPARTMENT_REQUIRED' })
  @MaxLength(120)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  department!: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'EMAIL_INVALID' })
  @MaxLength(254)
  @normaliseEmail()
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'PASSWORD_REQUIRED' })
  @MaxLength(MAX_PASSWORD)
  password!: string;
}

export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty({ message: 'TOKEN_REQUIRED' })
  @MaxLength(200)
  token!: string;
}

export class RequestPasswordResetDto {
  @IsEmail({}, { message: 'EMAIL_INVALID' })
  @MaxLength(254)
  @normaliseEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'TOKEN_REQUIRED' })
  @MaxLength(200)
  token!: string;

  @IsString()
  @MinLength(8, { message: 'PASSWORD_TOO_SHORT' })
  @MaxLength(MAX_PASSWORD, { message: 'PASSWORD_TOO_LONG' })
  password!: string;
}

export class ResendVerificationDto {
  @IsEmail({}, { message: 'EMAIL_INVALID' })
  @MaxLength(254)
  @normaliseEmail()
  email!: string;
}
