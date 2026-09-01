/**
 * The assessment instruments the ministry can assign (D-130/D-132).
 *
 * An employee can only TAKE an instrument that has been assigned to them; a
 * result already earned stays readable without an assignment. A closed list
 * rather than a table: there are exactly two instruments, and a third is a
 * member away — the RIASEC and English domains themselves stay siblings that
 * share no type (D-124), this list only names them for the assignment gate.
 */
export const ASSESSMENT_INSTRUMENTS = ['RIASEC', 'ENGLISH_CEFR'] as const;

export type AssessmentInstrument = (typeof ASSESSMENT_INSTRUMENTS)[number];
