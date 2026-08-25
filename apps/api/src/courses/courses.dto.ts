import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, MaxLength, Min, IsBoolean } from 'class-validator';

/** Query filters for the catalogue (§4.6): category-by-path, duration, search. */
export class CourseQueryDto {
  @IsOptional()
  @MaxLength(120, { message: 'SEARCH_TOO_LONG' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'PATH_NOT_FOUND' })
  pathId?: string;

  @IsOptional()
  /* Query strings arrive as text; the global pipe transforms, but the bounds
     still matter — an unbounded value is a pointless full scan. */
  @Transform(({ value }: { value: unknown }) => (value === undefined ? undefined : Number(value)))
  @IsInt({ message: 'DURATION_INVALID' })
  @Min(1, { message: 'DURATION_INVALID' })
  @Max(100_000, { message: 'DURATION_INVALID' })
  maxDurationMinutes?: number;
}

/**
 * The launch's one option (D-102). `embed` asks for a URL the player can
 * frame — chrome hidden, the quiz announcing itself. Absent or false: the
 * full-page handoff, unchanged.
 */
export class LaunchDto {
  @IsOptional()
  @IsBoolean()
  embed?: boolean;
}
