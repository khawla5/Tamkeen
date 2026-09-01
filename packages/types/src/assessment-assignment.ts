/**
 * Assignment — which instruments an employee must or may take (§4C.3,
 * TAM-147).
 *
 * An employee's *effective* list is never stored; it is resolved at read time
 * as the union of every `ALL` row, every row targeting their department, and
 * every row targeting their account, ordered by `displayOrder` and
 * de-duplicated by the instrument key a row resolves to — a group expands to
 * its member keys first. See `AssignmentResolutionService` on the API side
 * for the resolution itself; these are the shapes an admin screen edits and
 * reads back.
 */

/** Which instrument's scoring/bank/result shape applies (TAM-147). Shared by
 *  `assessments` and `assessment_results` — see `AssessmentResult` there. */
export const ASSESSMENT_KINDS = ['RIASEC', 'CEFR'] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

/** Who an assignment reaches. */
export const ASSIGNMENT_SCOPES = ['ALL', 'DEPARTMENT', 'USER'] as const;
export type AssignmentScope = (typeof ASSIGNMENT_SCOPES)[number];

/** One row of §4C.3's Assignments tab. */
export interface AdminAssessmentAssignmentRow {
  id: string;
  /** An instrument's `Assessment.key` or an `AssessmentGroup.key` — see
   *  `resolvedTitle` for which it turned out to be. */
  assessmentKey: string;
  /** What `assessmentKey` actually names, resolved server-side so the screen
   *  never has to guess between the two key spaces itself. */
  resolvedTitle: string;
  resolvedKind: 'INSTRUMENT' | 'GROUP';
  scope: AssignmentScope;
  /** Null for ALL; a `DEPARTMENTS` entry for DEPARTMENT; a user id for USER. */
  target: string | null;
  /** The account's name, only when `scope: 'USER'` — so the screen can show
   *  who without a second lookup. */
  targetLabel: string | null;
  required: boolean;
  displayOrder: number;
}

export interface CreateAssessmentAssignmentInput {
  assessmentKey: string;
  scope: AssignmentScope;
  /** Required with DEPARTMENT or USER; omitted (or ignored) for ALL. */
  target?: string;
  required: boolean;
  displayOrder: number;
}

export interface UpdateAssessmentAssignmentInput {
  required?: boolean;
  displayOrder?: number;
}

/** One named, ordered bundle of instruments — "«الحزمة الأساسية»". */
export interface AdminAssessmentGroupRow {
  id: string;
  key: string;
  name: string;
  /** Instrument keys, in assignment order. */
  memberKeys: string[];
  /** Each member key's display title, resolved alongside it — empty for a key
   *  that no longer resolves to anything (a stale reference an admin should
   *  clean up, not an error). */
  memberTitles: string[];
}

export interface SaveAssessmentGroupInput {
  key: string;
  name: string;
  memberKeys: string[];
}

/** One key an assignment or a group member could name, for the picker on
 *  §4C.3's Assignments tab — the same map `AdminAssessmentAssignmentsService`
 *  resolves `assessmentKey`/`memberKeys` against, offered back as options. */
export interface AdminAssessmentKeyOption {
  key: string;
  title: string;
  kind: 'INSTRUMENT' | 'GROUP';
}

/**
 * The instrument or group one `AssessmentAssignment` resolves to, and what an
 * employee has done about it — the piece `DashboardView.assessments` and the
 * admin's per-person view both read (§4.2 part 3, §4C.2 part 5).
 */
export interface ResolvedAssessmentAssignment {
  key: string;
  kind: AssessmentKind;
  title: string;
  required: boolean;
  displayOrder: number;
}
