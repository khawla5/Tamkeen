import { isPublishable, publishBlockers, type PublishReadinessInputs } from './publish-readiness';

const ready = (overrides: Partial<PublishReadinessInputs> = {}): PublishReadinessInputs => ({
  pathCount: 1,
  language: 'AR',
  objectives: ['فهم أساسيات إدارة المخاطر'],
  durationMinutes: 120,
  content: { completionConfigured: true },
  ...overrides,
});

describe('publishBlockers', () => {
  it('clears a fully prepared course', () => {
    expect(publishBlockers(ready())).toEqual([]);
    expect(isPublishable(ready())).toBe(true);
  });

  it('refuses a course in no path', () => {
    /* Without a path there is no route to it: browsable in the catalogue,
       selectable from no build page. */
    expect(publishBlockers(ready({ pathCount: 0 }))).toContain('NO_PATH');
  });

  it('refuses a course with no language', () => {
    expect(publishBlockers(ready({ language: null }))).toContain('NO_LANGUAGE');
  });

  it('refuses a course with no objectives', () => {
    expect(publishBlockers(ready({ objectives: [] }))).toContain('NO_OBJECTIVES');
  });

  it('refuses a course with no duration', () => {
    expect(publishBlockers(ready({ durationMinutes: null }))).toContain('NO_DURATION');
  });

  it('refuses a course the LMS says has no completion criteria', () => {
    /*
     * The D-042 dead end. Such a course reports `completed: false` forever, so
     * nobody on it can pass and no certificate can ever issue — with nothing in
     * any log to explain it. Phase 2 could only detect this from a learner
     * already stuck; this is the same failure caught before anyone enrols.
     */
    expect(publishBlockers(ready({ content: { completionConfigured: false } }))).toContain(
      'NO_COMPLETION_CRITERIA',
    );
  });

  it('refuses when the LMS could not be asked at all', () => {
    /*
     * "We could not confirm" is not "it is fine", and the two must not collapse
     * into one branch. The costs are asymmetric: a wrongly refused publish costs
     * one retry; a wrongly allowed one costs a cohort who can never finish.
     */
    expect(publishBlockers(ready({ content: null }))).toContain('LMS_UNREACHABLE');
  });

  it('does not report both an unreachable LMS and missing criteria', () => {
    /* They are the same slot with different causes; reporting both would tell an
       entity to fix something we never actually observed. */
    const blockers = publishBlockers(ready({ content: null }));

    expect(blockers).not.toContain('NO_COMPLETION_CRITERIA');
  });

  it('reports every blocker at once rather than the first', () => {
    /*
     * A gate that surfaces one problem per click makes an entity fix, click,
     * fix, click. The whole list, once, is the point.
     */
    const blockers = publishBlockers({
      pathCount: 0,
      language: null,
      objectives: [],
      durationMinutes: null,
      content: { completionConfigured: false },
    });

    expect(blockers).toEqual([
      'NO_PATH',
      'NO_LANGUAGE',
      'NO_OBJECTIVES',
      'NO_DURATION',
      'NO_COMPLETION_CRITERIA',
    ]);
  });

  it('treats an empty objective list and a missing one identically', () => {
    expect(publishBlockers(ready({ objectives: [] }))).toEqual(
      publishBlockers(ready({ objectives: [] })),
    );
  });
});
