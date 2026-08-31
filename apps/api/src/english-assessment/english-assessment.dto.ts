import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID, ValidateNested } from 'class-validator';

/**
 * Request shapes for the English placement test (§4.13).
 *
 * The client sends only *which option it chose*. It never sends a score, a mark
 * or a level — those exist solely on the server (see `english-scoring.ts`), so
 * there is nothing here a caller could tamper with to place themselves higher.
 *
 * A sibling of `assessment.dto.ts` rather than a reuse of it: the two share a
 * shape today, and keeping them apart means a change to one instrument's request
 * contract cannot silently alter the other's. The error codes differ for the
 * same reason.
 */

export class EnglishAssessmentAnswerDto {
  @IsUUID(undefined, { message: 'ENGLISH_ASSESSMENT_ANSWER_INVALID' })
  questionId!: string;

  @IsUUID(undefined, { message: 'ENGLISH_ASSESSMENT_ANSWER_INVALID' })
  optionId!: string;
}

export class SubmitEnglishAssessmentDto {
  @IsUUID(undefined, { message: 'ENGLISH_ASSESSMENT_NOT_FOUND' })
  assessmentId!: string;

  @IsArray()
  /* An upper bound so an oversized body cannot make the server do unbounded
     work before the completeness check rejects it. The bank is 30 items; 200
     leaves room for the ministry to grow it without a code change. */
  @ArrayMinSize(1, { message: 'ENGLISH_ASSESSMENT_INCOMPLETE' })
  @ArrayMaxSize(200, { message: 'ENGLISH_ASSESSMENT_TOO_MANY_ANSWERS' })
  @ValidateNested({ each: true })
  @Type(() => EnglishAssessmentAnswerDto)
  answers!: EnglishAssessmentAnswerDto[];
}
