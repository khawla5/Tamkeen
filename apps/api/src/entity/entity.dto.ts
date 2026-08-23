import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Validation for the entity portal.
 *
 * Every field is bounded. The global `ValidationPipe` runs with `whitelist` and
 * `forbidNonWhitelisted`, so anything not declared here is rejected outright
 * rather than ignored — which is what stops a caller smuggling `ownerEntityId`
 * into a query and reaching another organisation's rows.
 */

/** §4B.2's filter and search. */
export class EntityCourseQueryDto {
  @IsOptional()
  @IsString()
  /* Bounded so a search cannot push an arbitrarily large pattern into a
     database LIKE. */
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'UNPUBLISHED'])
  publication?: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';
}

/**
 * §4B.3's create form.
 *
 * Only what the LMS needs to bring a course into existence (D-060). Path
 * membership, duration, objectives and prerequisites are set afterwards on the
 * manage screen — asking for everything up front would make creating a course a
 * long form before the entity has even seen Moodle.
 */
export class CreateEntityCourseDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(2000)
  summary!: string;

  /** Optional at creation, required to publish (D-047). */
  @IsOptional()
  @IsIn(['AR', 'EN'])
  language?: 'AR' | 'EN';
}

/**
 * §4B.3's metadata form — a patch.
 *
 * Absent means "leave it alone"; `null` on the nullable fields means "clear it".
 * `ValidateIf` is what keeps those distinguishable: without it, class-validator
 * would reject an explicit `null` on `durationMinutes` and an entity could never
 * unset a value they had set by mistake.
 */
export class UpdateEntityCourseDto {
  @IsOptional()
  @IsArray()
  /* A course in more paths than the catalogue holds is a client error, and the
     bound stops an unbounded transaction below. */
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  pathIds?: string[];

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  /* Roughly 166 hours. High enough for any real course, low enough that a
     mistyped value is caught rather than rendered. */
  @Max(10_000)
  durationMinutes?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  objectives?: string[];

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(2000)
  prerequisites?: string | null;

  @IsOptional()
  @IsIn(['AR', 'EN'])
  language?: 'AR' | 'EN';
}

/** §4B.5's optional per-course filter. */
export class EntityLearnerQueryDto {
  @IsOptional()
  @IsUUID('4')
  courseId?: string;
}
