import type { PublishBlocker } from '@tamkeen/types';

/**
 * Whether a course is fit to appear in the learner catalogue (§4B.3, D-061).
 *
 * A pure function, deliberately: three callers need this answer — the manage
 * screen (to show what is missing), the publish endpoint (to refuse), and the
 * dashboard's "needs attention" list — and if they disagreed, an entity would be
 * told a course was ready by one screen and refused by another.
 *
 * **It returns every blocker, not the first.** A publish gate that reports one
 * problem at a time makes an entity click, fix, click, fix; the point is to hand
 * them the whole list once.
 */

export interface PublishReadinessInputs {
  /** Path membership. Ours, and the only route a learner has to the course. */
  pathCount: number;
  language: 'AR' | 'EN' | null;
  objectives: readonly string[];
  durationMinutes: number | null;
  /**
   * What the LMS reported, or **null when it could not be asked**. The two are
   * not the same and must not be collapsed: an unreachable LMS means we do not
   * know whether the course is completable, which is a reason to refuse rather
   * than to allow.
   */
  content: { completionConfigured: boolean } | null;
}

export function publishBlockers(inputs: PublishReadinessInputs): PublishBlocker[] {
  const blockers: PublishBlocker[] = [];

  /* Without a path there is no route to the course: it would sit in the
     catalogue reachable by browsing but selectable from no path build page. */
  if (inputs.pathCount === 0) {
    blockers.push('NO_PATH');
  }

  if (inputs.language === null) {
    blockers.push('NO_LANGUAGE');
  }

  /* An empty objectives list renders §4.7's section as a heading with nothing
     under it. The seed runner already refuses a course without them, for the
     same reason. */
  if (inputs.objectives.length === 0) {
    blockers.push('NO_OBJECTIVES');
  }

  if (inputs.durationMinutes === null) {
    blockers.push('NO_DURATION');
  }

  if (inputs.content === null) {
    /*
     * Fails closed. "We could not confirm this course is completable" is not
     * "this course is completable", and the cost of being wrong is asymmetric:
     * a wrongly refused publish costs one retry, while a wrongly allowed one
     * costs a cohort of learners who can never finish.
     */
    blockers.push('LMS_UNREACHABLE');
  } else if (!inputs.content.completionConfigured) {
    /*
     * The D-042 dead end, refused rather than warned about. A Moodle course with
     * no completion criteria reports `completed: false` forever, so nobody on it
     * can pass and no certificate can ever be issued — with nothing in any log
     * to explain why. A warning on a publish button gets dismissed.
     */
    blockers.push('NO_COMPLETION_CRITERIA');
  }

  return blockers;
}

export function isPublishable(inputs: PublishReadinessInputs): boolean {
  return publishBlockers(inputs).length === 0;
}
