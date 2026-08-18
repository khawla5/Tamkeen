import { Injectable, Logger, NotImplementedException } from '@nestjs/common';

import type { LmsPort } from '../lms.port';
import {
  LmsOperationError,
  LmsUnavailableError,
  type EnrolInput,
  type LmsCourse,
  type LmsCourseId,
  type LmsCourseProgress,
  type LmsHealth,
  type LmsUserId,
  type LmsUserRef,
  type ProvisionUserInput,
} from '../lms.types';
import {
  deriveMoodleUsername,
  generateUnusedPassword,
  normaliseEmail,
  splitFullName,
} from './moodle-identity';
import { MoodleWsClient, MoodleWsError } from './moodle-ws.client';

/**
 * The real Moodle adapter (Phase 2).
 *
 * Its whole job is translation: Moodle's web-service payloads in, our
 * `lms.types` vocabulary out. Every Moodle function name, field name and error
 * code lives in this file or in `moodle-ws.client.ts`; none of it may reach a
 * caller (D-030), and the contract suite asserts as much.
 *
 * Behaviour here is written against what a live Moodle **5.2.2** actually did in
 * the Phase 2 spike, not against the documentation. Where those two disagreed,
 * reality won, and the surprises are recorded in D-038 with the reasoning.
 *
 * Nothing is version-specific: the release string is read for reporting only, so
 * the production 4.5 LTS target and the 5.2 development instance run the same
 * code path.
 */

// ── Moodle payload shapes — confined to this file ───────────────────────────

interface MoodleSiteInfo {
  sitename?: string;
  release?: string;
  username?: string;
}

interface MoodleUser {
  id: number;
  username?: string;
}

@Injectable()
export class MoodleHttpService implements LmsPort {
  private readonly logger = new Logger(MoodleHttpService.name);

  constructor(
    private readonly baseUrl: string,
    private readonly client: MoodleWsClient,
  ) {}

  // ── health ────────────────────────────────────────────────────────────────

  /**
   * Never throws, by contract: an unreachable LMS is an operational state a
   * dashboard reports, not an exception every call site must handle.
   */
  async checkHealth(): Promise<LmsHealth> {
    try {
      const info = await this.client.call<MoodleSiteInfo>('core_webservice_get_site_info');

      return {
        reachable: true,
        ...(info.sitename ? { siteName: info.sitename } : {}),
        ...(info.release ? { lmsVersion: info.release } : {}),
      };
    } catch (error) {
      return {
        reachable: false,
        failureCode:
          error instanceof LmsUnavailableError ? error.failureCode : 'UNEXPECTED_RESPONSE',
      };
    }
  }

  // ── identity ──────────────────────────────────────────────────────────────

  /**
   * Creates or re-finds the Moodle account for one of our users.
   *
   * **Lookup-then-create, never create-then-catch.** The spike showed a blind
   * re-create is rejected with `invalidparameter`, so relying on the error to
   * detect an existing account would work only by accident and would depend on
   * Moodle's choice of error code.
   *
   * The lookup is by the username we derive, not by email — see
   * `moodle-identity.ts` and D-038 for why an email lookup silently cannot work
   * under a least-privilege token.
   */
  async provisionUser(input: ProvisionUserInput): Promise<LmsUserRef> {
    const email = normaliseEmail(input.email);
    const username = deriveMoodleUsername(email);

    const existing = await this.findByUsername(username);
    if (existing) {
      return { lmsUserId: existing.id, email };
    }

    const { firstname, lastname } = splitFullName(input.fullName);

    try {
      const created = await this.client.call<MoodleUser[]>('core_user_create_users', {
        users: [
          {
            username,
            /* Generated and immediately discarded: the account is reachable only
               through our handoff, by construction rather than by setting. */
            password: generateUnusedPassword(),
            firstname,
            lastname,
            email,
            auth: 'manual',
          },
        ],
      });

      const first = created?.[0];

      if (!first || typeof first.id !== 'number') {
        this.logger.error('core_user_create_users returned no usable user id');
        throw new LmsUnavailableError('UNEXPECTED_RESPONSE');
      }

      return { lmsUserId: first.id, email };
    } catch (error) {
      if (error instanceof LmsUnavailableError) {
        throw error;
      }

      /*
       * Two callers can race to provision the same user — the confirm request
       * and a retry, say. The loser sees Moodle reject the duplicate username,
       * and the correct answer is the winner's account, not an error: this
       * method is contractually idempotent.
       *
       * A re-lookup that finds nothing means the refusal was genuine (most
       * likely a hand-created account already holding this email under a
       * different username — the accepted cost recorded in D-038).
       */
      const raced = await this.findByUsername(username);

      if (raced) {
        this.logger.warn(`Provisioning raced for ${username}; using the existing account`);
        return { lmsUserId: raced.id, email };
      }

      this.logger.error(
        `Moodle refused to create a user: ${
          error instanceof MoodleWsError ? error.errorcode : 'unknown'
        }`,
      );
      throw new LmsOperationError('PROVISION');
    }
  }

  /**
   * Present because the port declares it. Note it resolves through the derived
   * username rather than Moodle's email index, which is the only route that
   * works under our token — so it answers "the account *we* would have created
   * for this address", which is exactly what every caller means by it.
   */
  async findUserByEmail(email: string): Promise<LmsUserRef | null> {
    const normalised = normaliseEmail(email);
    const found = await this.findByUsername(deriveMoodleUsername(normalised));

    return found ? { lmsUserId: found.id, email: normalised } : null;
  }

  private async findByUsername(username: string): Promise<MoodleUser | null> {
    try {
      const users = await this.client.call<MoodleUser[]>('core_user_get_users_by_field', {
        field: 'username',
        values: [username],
      });

      return Array.isArray(users) && users.length > 0 ? (users[0] ?? null) : null;
    } catch (error) {
      if (error instanceof LmsUnavailableError) {
        throw error;
      }

      /* A *failed* lookup is not the same as "no such user". Returning null here
         would make provisioning create a duplicate on every transient fault —
         the exact failure D-038 exists to prevent. */
      this.logger.error(
        `User lookup failed: ${error instanceof MoodleWsError ? error.errorcode : 'unknown'}`,
      );
      throw new LmsOperationError('PROVISION');
    }
  }

  // ── catalogue, enrolment, progress — later checkpoints ────────────────────

  listCourses(): Promise<LmsCourse[]> {
    return this.notYet('listCourses');
  }

  getCourse(_lmsCourseId: LmsCourseId): Promise<LmsCourse | null> {
    return this.notYet('getCourse');
  }

  enrol(_input: EnrolInput): Promise<void> {
    return this.notYet('enrol');
  }

  isEnrolled(_lmsUserId: LmsUserId, _lmsCourseId: LmsCourseId): Promise<boolean> {
    return this.notYet('isEnrolled');
  }

  getCourseProgress(
    _lmsUserId: LmsUserId,
    _lmsCourseId: LmsCourseId,
  ): Promise<LmsCourseProgress | null> {
    return this.notYet('getCourseProgress');
  }

  listProgressForUser(_lmsUserId: LmsUserId): Promise<LmsCourseProgress[]> {
    return this.notYet('listProgressForUser');
  }

  courseUrl(lmsCourseId: LmsCourseId): string {
    /* Pure URL construction against the configured base. Carries no token: this
       value is handed to a browser, where it would land in history and referrer
       headers. Seamless sign-in is a separate mechanism. */
    return `${this.baseUrl.replace(/\/+$/, '')}/course/view.php?id=${lmsCourseId}`;
  }

  private notYet(method: string): never {
    throw new NotImplementedException(
      `MOODLE_REAL_NOT_IMPLEMENTED: ${method} lands in a later Phase 2 checkpoint.`,
    );
  }
}
