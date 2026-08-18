import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID, ValidateNested } from 'class-validator';

/**
 * Request shapes for the assessment.
 *
 * The client sends only *which option it chose*. It never sends a score, a
 * dimension or a weight — those exist solely on the server (see scoring.ts), so
 * there is nothing here a caller could tamper with to steer their own result.
 */

export class AssessmentAnswerDto {
  @IsUUID(undefined, { message: 'ASSESSMENT_ANSWER_INVALID' })
  questionId!: string;

  @IsUUID(undefined, { message: 'ASSESSMENT_ANSWER_INVALID' })
  optionId!: string;
}

export class SubmitAssessmentDto {
  @IsUUID(undefined, { message: 'ASSESSMENT_NOT_FOUND' })
  assessmentId!: string;

  @IsArray()
  /* An upper bound so an oversized body cannot be used to make the server do
     unbounded work before the completeness check rejects it. The bank is 30
     items; 200 leaves room for Phase 5 to grow it without a code change. */
  @ArrayMinSize(1, { message: 'ASSESSMENT_INCOMPLETE' })
  @ArrayMaxSize(200, { message: 'ASSESSMENT_TOO_MANY_ANSWERS' })
  @ValidateNested({ each: true })
  @Type(() => AssessmentAnswerDto)
  answers!: AssessmentAnswerDto[];
}
