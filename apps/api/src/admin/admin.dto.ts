import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { USER_ROLES, type UserRole } from '@tamkeen/types';

/**
 * Validation for the super-admin portal.
 *
 * The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`,
 * so anything not declared here is rejected outright rather than ignored. That
 * matters more on this surface than on any other: these endpoints write roles
 * and account states, and a field that slipped through unvalidated would be a
 * privilege change nobody asked for.
 *
 * Every field is bounded. An administrator is trusted, which is not the same as
 * saying their input is — a paste accident should be a 400, not a row with a
 * megabyte in it.
 */

export class AdminUserQueryDto {
  @IsOptional()
  @IsString()
  /* Bounded so a search cannot push an arbitrarily large pattern into a
     database LIKE. */
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsIn(USER_ROLES)
  role?: UserRole;

  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'SUSPENDED';

  @IsOptional()
  @IsUUID()
  entityId?: string;

  /** Accounts that have never verified — the ones that cannot sign in yet. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unverified?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  /* A ceiling, not a suggestion: an unbounded page size is an export endpoint
     nobody designed, and §4C.8 is where exporting is done deliberately. */
  @Max(100)
  pageSize?: number;
}

export class CreateAdminUserDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  /**
   * Not validated against `EMPLOYEE_ID_PATTERN`.
   *
   * That pattern gates *self*-registration (D-017), and administrative
   * provisioning is the documented way around it — an entity contact has no
   * ministry employee number at all, and could never be provisioned if this
   * enforced one. Uniqueness is still the database's, and the bounds below stop
   * an accident.
   */
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  employeeId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  department!: string;

  @IsIn(USER_ROLES)
  role!: UserRole;

  /** Required for an ENTITY account, forbidden for every other role. */
  @IsOptional()
  @IsUUID()
  entityId?: string;
}

export class SetUserStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status!: 'ACTIVE' | 'SUSPENDED';
}

export class SetUserRoleDto {
  @IsIn(USER_ROLES)
  role!: UserRole;

  @IsOptional()
  @IsUUID()
  entityId?: string;
}

export class AdminEntityQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export class CreateAdminEntityDto {
  /**
   * A stable identifier, as `Path.key` and `Assessment.key` already are.
   *
   * Constrained to a slug because it is used in seeds and appears in audit
   * payloads: an Arabic organisation name is the display field, and a key that
   * could be anything would end up being one.
   */
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-z0-9][a-z0-9-]*$/i, { message: 'ENTITY_KEY_INVALID' })
  key!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  contactEmail?: string;
}

export class UpdateAdminEntityDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  contactEmail?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'SUSPENDED';
}
