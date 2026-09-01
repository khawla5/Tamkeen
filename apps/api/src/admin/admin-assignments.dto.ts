import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsUUID } from 'class-validator';

import { ASSESSMENT_INSTRUMENTS, type AssessmentInstrument } from '@tamkeen/types';

/** D-132 — assign one instrument to a set of employees. */
export class AssignAssessmentDto {
  @IsIn(ASSESSMENT_INSTRUMENTS)
  instrument!: AssessmentInstrument;

  /**
   * The employees, by id. Bounded: the screen assigns a picked selection, not
   * the workforce — a whole-ministry rollout is repeated selections, each an
   * auditable decision of its own.
   */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  userIds!: string[];
}
