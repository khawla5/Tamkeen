import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  ValidateIf,
  ValidateNested,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import {
  ASSIGNMENT_SCOPES,
  COURSE_VISIBILITIES,
  PATH_STATUSES,
  RIASEC_LETTERS,
  type PathStatus,
  USER_ROLES,
  type AssignmentScope,
  type CourseVisibility,
  type RiasecLetter,
  type UserRole,
} from '@tamkeen/types';

import { FULL_NAME_NO_DIGITS } from '../auth/auth.dto';

/**
 * Validation for the super-admin portal.
 *
 * The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`,
 * so anything not declared here is rejected outright rather than ignored. That
 * matters more on this surface than on any other: these endpoints write roles
 * and account states, and a field that slipped through unvalidated would be a
 * privilege change nobody asked for.
 *
 * Every field is bounded. An administrator is trusted, which is not the same as
 * saying their input is — a paste accident should be a 400, not a row with a
 * megabyte in it.
 */

export class AdminUserQueryDto {
  @IsOptional()
  @IsString()
  /* Bounded so a search cannot push an arbitrarily large pattern into a
     database LIKE. */
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsIn(USER_ROLES)
  role?: UserRole;

  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'SUSPENDED';

  @IsOptional()
  @IsUUID()
  entityId?: string;

  /** Accounts that have never verified — the ones that cannot sign in yet. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unverified?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  /* A ceiling, not a suggestion: an unbounded page size is an export endpoint
     nobody designed, and §4C.8 is where exporting is done deliberately. */
  @Max(100)
  pageSize?: number;
}

export class CreateAdminUserDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(FULL_NAME_NO_DIGITS, { message: 'FULL_NAME_HAS_DIGITS' })
  fullName!: string;

  /**
   * Not validated against `EMPLOYEE_ID_PATTERN`.
   *
   * That pattern gates *self*-registration (D-017), and administrative
   * provisioning is the documented way around it — an entity contact has no
   * ministry employee number at all, and could never be provisioned if this
   * enforced one. Uniqueness is still the database's, and the bounds below stop
   * an accident.
   */
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  employeeId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  department!: string;

  @IsIn(USER_ROLES)
  role!: UserRole;

  /** Required for an ENTITY account, forbidden for every other role. */
  @IsOptional()
  @IsUUID()
  entityId?: string;
}

export class SetUserStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status!: 'ACTIVE' | 'SUSPENDED';
}

export class SetUserDepartmentDto {
  /**
   * Not matched against the closed list the forms offer: like `employeeId` on
   * provisioning, the list gates what the screen proposes and an existing account
   * may hold a department that predates it. Bounds only, to stop an accident.
   */
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  department!: string;
}

export class AdminEntityQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export class CreateAdminEntityDto {
  /**
   * A stable identifier, as `Path.key` and `Assessment.key` already are.
   *
   * Constrained to a slug because it is used in seeds and appears in audit
   * payloads: an Arabic organisation name is the display field, and a key that
   * could be anything would end up being one.
   */
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-z0-9][a-z0-9-]*$/i, { message: 'ENTITY_KEY_INVALID' })
  key!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  contactEmail?: string;
}

export class UpdateAdminEntityDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  contactEmail?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'SUSPENDED';
}

// ─────────────────────────────────────────────────────────────────────────────
// §4C.3 — the assessment editor
// ─────────────────────────────────────────────────────────────────────────────

export class UpdateDraftDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class AddDraftQuestionDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  text!: string;

  /** What a correct answer is worth. One mark unless the author says otherwise. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  marks?: number;

  /** The rung the item is aimed at. Authoring metadata; scoring never reads it. */
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  levelId?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(80)
  topic?: string | null;
}

export class UpdateDraftQuestionDto {
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  text?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  marks?: number;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  levelId?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(80)
  topic?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  displayOrder?: number;
}

export class UpdateDraftOptionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label?: string;

  /**
   * Whether this is the answer.
   *
   * Setting it true clears the flag on every sibling: a question with two
   * correct answers is not a state the editor should be able to reach, and
   * making the client send two requests to move a tick would leave the bank
   * momentarily invalid between them.
   */
  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;
}

/** One band of the placement rule (§4C.3, D-134). The whole table is sent. */
export class BandDto {
  @IsUUID()
  levelId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  minScore!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  maxScore!: number;
}

export class SetBandsDto {
  /**
   * The complete table, or an empty list to fall back to the even split.
   *
   * Sent whole rather than edited row by row because the rule it expresses is a
   * partition: a single band is meaningless on its own, and validating one at a
   * time would let the editor sit in a state with a gap in it.
   */
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BandDto)
  bands!: BandDto[];
}

export class ReorderDraftDto {
  /** The complete order. A partial one is refused by the service. */
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  questionIds!: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// §4C.3 (TAM-147) — the ministry-wide RIASEC instrument editor. Named apart
// from the plain `*DraftDto`s above: those edit one path's own placement
// test (D-134), these edit the RIASEC bank `AdminRiasecAssessmentService`
// serves at `/admin/assessment` — two editors that happen to share a shape,
// never the same rows.
// ─────────────────────────────────────────────────────────────────────────────

export class RiasecUpdateDraftDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class RiasecAddDraftQuestionDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  text!: string;

  /** Which dimension the new question's Likert options score. */
  @IsIn(RIASEC_LETTERS)
  letter!: RiasecLetter;
}

export class RiasecUpdateDraftQuestionDto {
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  text?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  displayOrder?: number;
}

/**
 * An option's weights, one bounded integer per dimension.
 *
 * **Every letter is declared explicitly** rather than accepted as a
 * `Record<string, number>`. The DTO is the outermost gate: a `Record` would let
 * `{ "X": 4 }` through validation and leave the enum column to reject it as a
 * 500, and `{ "R": 4, "r": 4 }` through as two keys the database would treat as
 * one. Naming the six is the only shape in which the validator can say no.
 *
 * The 0-10 ceiling is not the Likert scale (0-4) — the schema has always allowed
 * an option to weigh more, and D-048 gives the administrator the weightings.
 * What the bound stops is a typo that makes one dimension unreachable by every
 * other, which the balance guard would then report as an imbalance rather than
 * as the mistake it is.
 */
export class OptionWeightsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  R?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  I?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  A?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  S?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  E?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  C?: number;
}

export class RiasecUpdateDraftOptionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => OptionWeightsDto)
  weights?: OptionWeightsDto;
}

export class RiasecReorderDraftDto {
  /** The complete order. A partial one is refused by the service. */
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  questionIds!: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// §4C.4 — path management
// ─────────────────────────────────────────────────────────────────────────────

export class CreatePathDto {
  /** Stable slug, as `Path.key` already is. */
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-z0-9][a-z0-9-]*$/i, { message: 'PATH_KEY_INVALID' })
  key!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description!: string;

  /* Short noun phrases, not sentences — "three to five" is editorial guidance
     (TAM-150), not a bound the form enforces; the cap here is generous
     headroom, not the target count. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  skillOutcomes?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  /* A year of full-time study, as an upper bound on a typo rather than a
     product rule. */
  @Max(525_600)
  typicalDurationMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  displayOrder?: number;

  /* No `status`: a path is created with no rungs, no assessment and no placed
     course, which is exactly what `pathBlockers` refuses. Publishing is a
     second, deliberate step. */
}

export class UpdatePathDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  skillOutcomes?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(525_600)
  typicalDurationMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  displayOrder?: number;

  /** Whether the ministry may assign it. Refused when the path is not offerable. */
  @IsOptional()
  @IsIn(PATH_STATUSES)
  status?: PathStatus;
}

export class AttachCourseDto {
  @IsUUID()
  courseId!: string;

  /* Deliberately no `levelId` and no `position`. Attaching a course to a path
     and deciding where it sits are two decisions with two endpoints (D-134),
     and the global pipe's `forbidNonWhitelisted` refuses either field here. */
}

export class CreateLevelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}

export class UpdateLevelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}

export class ReorderLevelsDto {
  /** The complete order. A partial one is refused by the service. */
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  levelIds!: string[];
}

/**
 * Where a course sits in a path (§4C.4, D-134). **Admin only.**
 *
 * `levelId: null` unplaces it — back to the unassigned group, visible to no
 * learner. `position` absent means the end of the level, which is what dropping
 * a course onto a rung means by default.
 */
export class PlaceCourseDto {
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  levelId?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  position?: number | null;
}

export class ReorderLevelCoursesDto {
  /** The complete order of one level's memberships. */
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  pathCourseIds!: string[];
}

/**
 * §4C.2 — assigning a path to employees (D-130/D-134).
 *
 * Sent as one request per path with many employees, because that is how an
 * administrator works: a directorate is put on a path together. Each grant is
 * still its own audit event.
 */
export class AssignPathDto {
  @IsUUID()
  pathId!: string;

  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  userIds!: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// §4C.3 — typed instruments and their assignment (TAM-147)
// ─────────────────────────────────────────────────────────────────────────────

export class CreateAssessmentAssignmentDto {
  /** An `Assessment.key` or an `AssessmentGroup.key` — the service resolves
   *  which. */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  assessmentKey!: string;

  @IsIn(ASSIGNMENT_SCOPES)
  scope!: AssignmentScope;

  /** A department name for DEPARTMENT, a user id for USER. Required for both,
   *  refused for ALL — the service enforces the pairing. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  target?: string;

  @IsBoolean()
  required!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  displayOrder!: number;
}

export class UpdateAssessmentAssignmentDto {
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  displayOrder?: number;
}

export class SaveAssessmentGroupDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-z0-9][a-z0-9-]*$/i, { message: 'ASSESSMENT_GROUP_KEY_INVALID' })
  key!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  /** Instrument keys, in the order they should be assigned. A group with none
   *  is a bundle with nothing to hand out — the service refuses it. */
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  memberKeys!: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// §4C.5 — course oversight
// ─────────────────────────────────────────────────────────────────────────────

export class AdminCourseQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'UNPUBLISHED'])
  publication?: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';

  /**
   * The administrator's vocabulary: available, or hidden (§4C.5, TAM-134).
   *
   * Replaces a four-value status filter, because the four were a derivation the
   * screen no longer shows: an administrator filtering the catalogue is asking
   * whether an employee can choose the course, and `courseStatusesFor` resolves
   * that to the statuses it covers.
   */
  @IsOptional()
  @IsIn(COURSE_VISIBILITIES)
  visibility?: CourseVisibility;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsUUID()
  pathId?: string;

  /**
   * Courses no organisation supplies.
   *
   * Its own flag rather than a sentinel in `entityId`, because "nobody supplies
   * this" is a different question from "this organisation does" — and a sentinel
   * is how a filter for a real entity whose id happened to match would one day
   * return the wrong rows.
   */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unowned?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

/**
 * `YYYY-MM-DD`.
 *
 * Shape only — it constrains the month to 01-12 and the day to 01-31, and it
 * still accepts `2026-02-31`, which the calendar does not have. The service
 * settles that with `isCalendarDay` before the day becomes an instant; putting
 * the whole rule in a regex would be a second calendar implementation, and the
 * one that disagreed would be this one.
 *
 * Declared above the class on purpose: decorators run when the class is defined,
 * so a `const` below it would be read from its temporal dead zone.
 */
const CALENDAR_DAY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class InterveneCourseDto {
  /**
   * PUBLISHED restores a course to the catalogue; UNPUBLISHED takes it out.
   *
   * DRAFT is accepted by the validator and refused by the service, so the
   * refusal carries a reason an administrator can read rather than a generic
   * "must be one of" — the distinction is a product rule, not a typo.
   */
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'UNPUBLISHED'])
  publication?: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';

  /** Null places the course back with nobody; a uuid assigns it (D-063). */
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  ownerEntityId?: string | null;

  /**
   * The availability window, as calendar days (§4C.5, TAM-134).
   *
   * Three states each, and all three are meaningful: absent leaves the bound
   * alone, `null` clears it, and a `YYYY-MM-DD` sets it. Collapsing absent and
   * null would make every edit of the *other* bound silently clear this one.
   *
   * Days, not instants: the administrator picks a date and the server decides
   * which moment that is in ministry time (`availabilityWindowFrom`/`Until`),
   * so a browser in another zone cannot shift the boundary by a day.
   */
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Matches(CALENDAR_DAY_PATTERN, { message: 'availableFrom must be YYYY-MM-DD' })
  availableFrom?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Matches(CALENDAR_DAY_PATTERN, { message: 'availableUntil must be YYYY-MM-DD' })
  availableUntil?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// §4C.6 — system settings
// ─────────────────────────────────────────────────────────────────────────────

export class UpdateSettingDto {
  /**
   * The raw value, as text.
   *
   * A string because the table is key-value and the *types* live in
   * `settings.schema.ts`, which parses this against the same Zod field the
   * environment variable is validated with. So a number arrives as "70" and is
   * refused unless it parses as one — which is exactly what `PASS_THRESHOLD=70`
   * in a `.env` file goes through.
   */
  @IsString()
  @MaxLength(2000)
  value!: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// §4C.8 — the audit trail
// ─────────────────────────────────────────────────────────────────────────────

export class AdminAuditQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;

  @IsOptional()
  @IsIn(['SUCCESS', 'FAILURE'])
  outcome?: 'SUCCESS' | 'FAILURE';

  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  /**
   * Cursor: the id to read before.
   *
   * A cursor rather than an offset because the log only grows — `OFFSET 20000`
   * makes the database walk twenty thousand rows before it can skip them, on
   * what will be the largest table in the system. Matched as digits rather than
   * coerced to a number: `audit_log.id` is a bigint and a JSON number cannot
   * carry one safely.
   */
  @IsOptional()
  @Matches(/^[0-9]{1,19}$/)
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  pageSize?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// §4C.8 — «الأثر» (TAM-149)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The period and the slice.
 *
 * The same `from`/`to` the trail already accepts, sent as the screen's own two
 * ends (midnight to the last millisecond of the day) — so which preset the
 * administrator clicked stays a question about presentation and never becomes a
 * vocabulary the API has to grow a branch for. Both are optional; the service
 * answers for the current month when neither is given.
 *
 * `department` is matched exactly against `users.department`. It is not
 * validated against the ministry's list: the column accepts any non-empty
 * string today (see the web's `DEPARTMENTS`), so a whitelist here would fail
 * closed on a department that legitimately exists in the data.
 */
export class AdminImpactQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;
}

/**
 * §4C.7 — whom the certificate preview is drawn for.
 *
 * Both optional: with neither, the preview is the sample certificate; with one
 * or both, that real name and path are printed on it. UUIDs only, so a query
 * string cannot become anything but a lookup key.
 */
export class AdminTemplatePreviewQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  pathId?: string;
}
