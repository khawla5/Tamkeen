import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  ValidateIf,
  ValidateNested,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { RIASEC_LETTERS, USER_ROLES, type RiasecLetter, type UserRole } from '@tamkeen/types';

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

// ─────────────────────────────────────────────────────────────────────────────
// §4C.3 — the assessment editor
// ─────────────────────────────────────────────────────────────────────────────

export class UpdateDraftDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class AddDraftQuestionDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  text!: string;

  /** Which dimension the new question's Likert options score. */
  @IsIn(RIASEC_LETTERS)
  letter!: RiasecLetter;
}

export class UpdateDraftQuestionDto {
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  text?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  displayOrder?: number;
}

/**
 * An option's weights, one bounded integer per dimension.
 *
 * **Every letter is declared explicitly** rather than accepted as a
 * `Record<string, number>`. The DTO is the outermost gate: a `Record` would let
 * `{ "X": 4 }` through validation and leave the enum column to reject it as a
 * 500, and `{ "R": 4, "r": 4 }` through as two keys the database would treat as
 * one. Naming the six is the only shape in which the validator can say no.
 *
 * The 0-10 ceiling is not the Likert scale (0-4) — the schema has always allowed
 * an option to weigh more, and D-048 gives the administrator the weightings.
 * What the bound stops is a typo that makes one dimension unreachable by every
 * other, which the balance guard would then report as an imbalance rather than
 * as the mistake it is.
 */
export class OptionWeightsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  R?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  I?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  A?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  S?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  E?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  C?: number;
}

export class UpdateDraftOptionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => OptionWeightsDto)
  weights?: OptionWeightsDto;
}

export class ReorderDraftDto {
  /** The complete order. A partial one is refused by the service. */
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  questionIds!: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// §4C.4 — path management
// ─────────────────────────────────────────────────────────────────────────────

export class CreatePathDto {
  /** Stable slug, as `Path.key` already is. */
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-z0-9][a-z0-9-]*$/i, { message: 'PATH_KEY_INVALID' })
  key!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description!: string;

  @IsIn(RIASEC_LETTERS)
  riasecLetter!: RiasecLetter;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  /* A year of full-time study, as an upper bound on a typo rather than a
     product rule. */
  @Max(525_600)
  typicalDurationMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  displayOrder?: number;

  /* No `isActive`: a path is created empty, and an empty path is one no learner
     could confirm. Activation is a second, deliberate step. */
}

export class UpdatePathDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(RIASEC_LETTERS)
  riasecLetter?: RiasecLetter;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(525_600)
  typicalDurationMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  displayOrder?: number;

  /** Whether learners are offered it. Refused when the path is not offerable. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AttachCourseDto {
  @IsUUID()
  courseId!: string;
}

export class ReorderPathCoursesDto {
  /** The complete order. A partial one is refused by the service. */
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  courseIds!: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// §4C.5 — course oversight
// ─────────────────────────────────────────────────────────────────────────────

export class AdminCourseQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'UNPUBLISHED'])
  publication?: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';

  @IsOptional()
  @IsIn(['DRAFT', 'AVAILABLE', 'HIDDEN_BUT_COMPLETABLE', 'RETIRED'])
  status?: 'DRAFT' | 'AVAILABLE' | 'HIDDEN_BUT_COMPLETABLE' | 'RETIRED';

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsUUID()
  pathId?: string;

  /**
   * Courses no organisation supplies.
   *
   * Its own flag rather than a sentinel in `entityId`, because "nobody supplies
   * this" is a different question from "this organisation does" — and a sentinel
   * is how a filter for a real entity whose id happened to match would one day
   * return the wrong rows.
   */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unowned?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class InterveneCourseDto {
  /**
   * PUBLISHED restores a course to the catalogue; UNPUBLISHED takes it out.
   *
   * DRAFT is accepted by the validator and refused by the service, so the
   * refusal carries a reason an administrator can read rather than a generic
   * "must be one of" — the distinction is a product rule, not a typo.
   */
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'UNPUBLISHED'])
  publication?: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';

  /** Null places the course back with nobody; a uuid assigns it (D-063). */
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  ownerEntityId?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// §4C.6 — system settings
// ─────────────────────────────────────────────────────────────────────────────

export class UpdateSettingDto {
  /**
   * The raw value, as text.
   *
   * A string because the table is key-value and the *types* live in
   * `settings.schema.ts`, which parses this against the same Zod field the
   * environment variable is validated with. So a number arrives as "70" and is
   * refused unless it parses as one — which is exactly what `PASS_THRESHOLD=70`
   * in a `.env` file goes through.
   */
  @IsString()
  @MaxLength(2000)
  value!: string;
}
