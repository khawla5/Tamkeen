import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  CV_MAX_DESCRIPTION,
  CV_MAX_EDUCATION,
  CV_MAX_EXPERIENCE,
  CV_MAX_EXTERNAL_CERTIFICATIONS,
  CV_MAX_SHORT_TEXT,
  CV_MAX_SKILLS,
  CV_MAX_SUMMARY,
} from '@tamkeen/types';

/**
 * The CV as submitted (§4.11).
 *
 * **Validated on the server as well as in the form**, per §2B: the sections are
 * stored as JSON, and JSON is exactly where an unvalidated shape stops being
 * obvious. Every bound here has a reason — an unbounded summary is a storage
 * problem, five hundred experience entries is a rendering problem in a browser
 * that has to lay them out into a PDF, and a free-text date is a formatting
 * problem the moment D-018 has to render it.
 *
 * `whitelist: true` on the global pipe strips anything not declared, so a field
 * the learner's browser invented never reaches the database.
 */

/** `YYYY-MM`, so `format.ts` can render it rather than the caller. */
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

class CvExperienceDto {
  @IsString()
  @MaxLength(CV_MAX_SHORT_TEXT)
  id!: string;

  @IsString()
  @MaxLength(CV_MAX_SHORT_TEXT)
  role!: string;

  @IsString()
  @MaxLength(CV_MAX_SHORT_TEXT)
  organization!: string;

  @Matches(MONTH, { message: 'CV_INVALID_DATE' })
  startDate!: string;

  /** Null means "current" — the one state §4.11 names explicitly. */
  @IsOptional()
  @Matches(MONTH, { message: 'CV_INVALID_DATE' })
  endDate!: string | null;

  @IsString()
  @MaxLength(CV_MAX_DESCRIPTION)
  description!: string;
}

class CvEducationDto {
  @IsString()
  @MaxLength(CV_MAX_SHORT_TEXT)
  id!: string;

  @IsString()
  @MaxLength(CV_MAX_SHORT_TEXT)
  qualification!: string;

  @IsString()
  @MaxLength(CV_MAX_SHORT_TEXT)
  institution!: string;

  /* Bounded rather than free: a four-digit year is the whole point, and 1900
     to 2100 is wide enough for any real record while still rejecting a typo
     that would render as a nonsense date. */
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  startYear!: number | null;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  endYear!: number | null;
}

class CvExternalCertificationDto {
  @IsString()
  @MaxLength(CV_MAX_SHORT_TEXT)
  id!: string;

  @IsString()
  @MaxLength(CV_MAX_SHORT_TEXT)
  title!: string;

  @IsString()
  @MaxLength(CV_MAX_SHORT_TEXT)
  issuer!: string;

  @IsOptional()
  @Matches(MONTH, { message: 'CV_INVALID_DATE' })
  issuedOn!: string | null;
}

export class SaveCvDto {
  @IsString()
  @MaxLength(CV_MAX_SHORT_TEXT)
  fullName!: string;

  @IsString()
  @MaxLength(CV_MAX_SHORT_TEXT)
  jobTitle!: string;

  @IsString()
  @MaxLength(CV_MAX_SHORT_TEXT)
  department!: string;

  @IsString()
  @MaxLength(CV_MAX_SHORT_TEXT)
  email!: string;

  @IsString()
  @MaxLength(CV_MAX_SHORT_TEXT)
  phone!: string;

  @IsString()
  @MaxLength(CV_MAX_SUMMARY)
  summary!: string;

  @IsArray()
  @ArrayMaxSize(CV_MAX_EXPERIENCE, { message: 'CV_TOO_MANY_ENTRIES' })
  @ValidateNested({ each: true })
  @Type(() => CvExperienceDto)
  experience!: CvExperienceDto[];

  @IsArray()
  @ArrayMaxSize(CV_MAX_EDUCATION, { message: 'CV_TOO_MANY_ENTRIES' })
  @ValidateNested({ each: true })
  @Type(() => CvEducationDto)
  education!: CvEducationDto[];

  @IsArray()
  @ArrayMaxSize(CV_MAX_SKILLS, { message: 'CV_TOO_MANY_ENTRIES' })
  @IsString({ each: true })
  @MaxLength(CV_MAX_SHORT_TEXT, { each: true })
  skills!: string[];

  @IsArray()
  @ArrayMaxSize(CV_MAX_EXTERNAL_CERTIFICATIONS, { message: 'CV_TOO_MANY_ENTRIES' })
  @ValidateNested({ each: true })
  @Type(() => CvExternalCertificationDto)
  externalCertifications!: CvExternalCertificationDto[];

  @IsBoolean()
  showCareerProfile!: boolean;
}
