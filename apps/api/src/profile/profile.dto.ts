import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/**
 * §4.12's profile card, saved as one action — both fields together, not a
 * patch. Employee id and role are never accepted here: they are read-only by
 * product rule, and the global `ValidationPipe`'s `forbidNonWhitelisted`
 * rejects the request outright if either is sent, rather than silently
 * ignoring an attempt to change them.
 */
export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty({ message: 'FULL_NAME_REQUIRED' })
  @MaxLength(120)
  @trim()
  fullName!: string;

  @IsString()
  @IsNotEmpty({ message: 'DEPARTMENT_REQUIRED' })
  @MaxLength(120)
  @trim()
  department!: string;
}
