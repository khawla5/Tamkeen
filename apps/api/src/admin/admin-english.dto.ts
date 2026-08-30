import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { CEFR_LEVELS, ENGLISH_SKILLS, type CefrLevel, type EnglishSkill } from '@tamkeen/types';

/**
 * Request shapes for §4C.9.
 *
 * A sibling of `admin.dto.ts`'s assessment DTOs rather than a reuse: the two
 * instruments have different editable facts, and the one thing they share — a
 * complete-order reorder — is three lines.
 *
 * **Bounds here are the outermost gate.** `marks` and the band scores reach an
 * integer column, so an unbounded value is a 500 from the database rather than a
 * refusal the screen can render; and a `marks` of a few billion would let one
 * item dominate a thirty-item instrument without any rule below noticing, since
 * the publish gate checks the *shape* of the bank, not whether its weighting is
 * sane.
 */

const MAX_MARKS = 100;
const MAX_SCORE = 10_000;

export class UpdateEnglishDraftDto {
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'ENGLISH_TITLE_TOO_SHORT' })
  @MaxLength(200, { message: 'ENGLISH_TITLE_TOO_LONG' })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'ENGLISH_DESCRIPTION_TOO_LONG' })
  description?: string;
}

export class AddEnglishQuestionDto {
  @IsString()
  @MinLength(3, { message: 'ENGLISH_QUESTION_TEXT_REQUIRED' })
  @MaxLength(1000, { message: 'ENGLISH_QUESTION_TEXT_TOO_LONG' })
  text!: string;

  @IsInt({ message: 'ENGLISH_MARKS_INVALID' })
  @Min(1, { message: 'ENGLISH_MARKS_INVALID' })
  @Max(MAX_MARKS, { message: 'ENGLISH_MARKS_INVALID' })
  marks!: number;

  /* Named explicitly rather than accepted as a string, on the same reasoning
     `OptionWeightsDto` names the six RIASEC letters: the DTO is the outermost
     gate, and letting an unknown value through leaves the enum column to answer
     500 instead of the API answering "no". */
  @IsIn(CEFR_LEVELS, { message: 'ENGLISH_LEVEL_INVALID' })
  level!: CefrLevel;

  @IsIn(ENGLISH_SKILLS, { message: 'ENGLISH_SKILL_INVALID' })
  skill!: EnglishSkill;

  @IsArray()
  /* Two is the minimum that makes it a choice; six is more distractors than any
     placement item needs and keeps a runaway payload out of the database. */
  @ArrayMinSize(2, { message: 'ENGLISH_TOO_FEW_OPTIONS' })
  @ArrayMaxSize(6, { message: 'ENGLISH_TOO_MANY_OPTIONS' })
  @IsString({ each: true })
  @MinLength(1, { each: true, message: 'ENGLISH_OPTION_LABEL_REQUIRED' })
  @MaxLength(500, { each: true, message: 'ENGLISH_OPTION_LABEL_TOO_LONG' })
  options!: string[];

  /** Which of `options` is the right answer. Checked against the array's length
   *  in the service, where the array is in scope. */
  @IsInt({ message: 'ENGLISH_CORRECT_OPTION_REQUIRED' })
  @Min(0, { message: 'ENGLISH_CORRECT_OPTION_REQUIRED' })
  correctIndex!: number;
}

export class UpdateEnglishQuestionDto {
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'ENGLISH_QUESTION_TEXT_REQUIRED' })
  @MaxLength(1000, { message: 'ENGLISH_QUESTION_TEXT_TOO_LONG' })
  text?: string;

  @IsOptional()
  @IsInt({ message: 'ENGLISH_MARKS_INVALID' })
  @Min(1, { message: 'ENGLISH_MARKS_INVALID' })
  @Max(MAX_MARKS, { message: 'ENGLISH_MARKS_INVALID' })
  marks?: number;

  @IsOptional()
  @IsIn(CEFR_LEVELS, { message: 'ENGLISH_LEVEL_INVALID' })
  level?: CefrLevel;

  @IsOptional()
  @IsIn(ENGLISH_SKILLS, { message: 'ENGLISH_SKILL_INVALID' })
  skill?: EnglishSkill;
}

export class UpdateEnglishOptionDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'ENGLISH_OPTION_LABEL_REQUIRED' })
  @MaxLength(500, { message: 'ENGLISH_OPTION_LABEL_TOO_LONG' })
  label?: string;

  /** Setting this true clears the question's other options (radio semantics). */
  @IsOptional()
  @IsBoolean({ message: 'ENGLISH_CORRECT_OPTION_REQUIRED' })
  isCorrect?: boolean;
}

export class EnglishBandDto {
  @IsIn(CEFR_LEVELS, { message: 'ENGLISH_LEVEL_INVALID' })
  level!: CefrLevel;

  @IsInt({ message: 'ENGLISH_BAND_SCORE_INVALID' })
  @Min(0, { message: 'ENGLISH_BAND_SCORE_INVALID' })
  @Max(MAX_SCORE, { message: 'ENGLISH_BAND_SCORE_INVALID' })
  minScore!: number;

  @IsInt({ message: 'ENGLISH_BAND_SCORE_INVALID' })
  @Min(0, { message: 'ENGLISH_BAND_SCORE_INVALID' })
  @Max(MAX_SCORE, { message: 'ENGLISH_BAND_SCORE_INVALID' })
  maxScore!: number;
}

/**
 * The complete band table.
 *
 * A partition is one object: moving a boundary changes two bands, so a per-band
 * endpoint would force the administrator through states that are invalid by
 * construction. Whether the table is a *valid* partition is the publish gate's
 * question, not this one's — a draft whose bank has just grown has a stale table
 * by definition, and refusing the save would leave no way to fix it.
 */
export class SetEnglishBandsDto {
  @IsArray()
  @ArrayMaxSize(6, { message: 'ENGLISH_BANDS_INVALID' })
  @ValidateNested({ each: true })
  @Type(() => EnglishBandDto)
  bands!: EnglishBandDto[];
}

export class ReorderEnglishDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'ENGLISH_ORDER_INCOMPLETE' })
  @ArrayMaxSize(500, { message: 'ENGLISH_ORDER_INCOMPLETE' })
  @IsUUID(undefined, { each: true, message: 'ENGLISH_QUESTION_NOT_IN_DRAFT' })
  questionIds!: string[];
}
