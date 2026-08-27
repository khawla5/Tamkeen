import { presentableDetail } from './admin-audit.service';

/**
 * What a detail payload is allowed to carry onto §4C.8's screen (TAM-137).
 *
 * The audit service already refuses free text, so nothing here is about PII.
 * This is about a different failure: the payload was written for whoever would
 * one day debug the system, and it was being rendered verbatim to the ministry
 * — `pathId=fa9f3562-0adf-41d2-9fab-965227774de9` left-to-right in the middle
 * of an Arabic page. An identifier on screen is an internal in place of an
 * answer, and the resolved target name is the answer.
 */
describe('presentable audit detail', () => {
  it('lifts the reason out, because it is the one detail rendered as a sentence', () => {
    expect(presentableDetail({ reason: 'BAD_PASSWORD' })).toEqual({
      reason: 'BAD_PASSWORD',
      detail: null,
    });
  });

  it('drops identifiers named as such', () => {
    const { detail } = presentableDetail({
      pathId: '11111111-2222-3333-4444-555555555555',
      courses: 5,
    });

    expect(detail).toEqual({ courses: 5 });
  });

  it('drops anything uuid-shaped whatever it is called', () => {
    /* Belt and braces: the next phase will add a key this list does not name,
       and the shape is the property that actually matters. */
    const { detail } = presentableDetail({
      somethingNew: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      status: 'RETIRED',
    });

    expect(detail).toEqual({ status: 'RETIRED' });
  });

  it('drops the LMS ids, which name a system the ministry does not administer', () => {
    const { detail } = presentableDetail({ moodleCourseId: 909451, entityId: 'x' });

    expect(detail).toBeNull();
  });

  it('keeps the route of a denied request', () => {
    /* The exception that proves the rule: "who tried to reach the admin
       settings" is the whole point of an AUTHZ_DENIED entry, and a route is not
       an identifier. */
    const { detail } = presentableDetail({
      path: '/api/admin/settings',
      method: 'GET',
      reason: 'INSUFFICIENT_ROLE',
    });

    expect(detail).toEqual({ path: '/api/admin/settings', method: 'GET' });
  });

  it('keeps counts, statuses and changed-field names', () => {
    const { detail } = presentableDetail({
      seen: 48,
      created: 0,
      fields: 'availableFrom,availableUntil',
      heldByLearners: false,
    });

    expect(detail).toEqual({
      seen: 48,
      created: 0,
      fields: 'availableFrom,availableUntil',
      heldByLearners: false,
    });
  });

  it('drops a detail that only restates the target', () => {
    /* A settings change carried `setting=CERT_ISSUING_BODY` beside a target of
       exactly that key — the same fact printed twice, once labelled and once
       not. */
    const { detail } = presentableDetail(
      { setting: 'CERT_ISSUING_BODY', value: 'وزارة الداخلية' },
      'CERT_ISSUING_BODY',
    );

    expect(detail).toEqual({ value: 'وزارة الداخلية' });
  });

  it('reports nothing rather than an empty object', () => {
    /* So the screen's `detail !== null` test means "there is something to show"
       and not "there is a payload, possibly empty". */
    expect(presentableDetail(null)).toEqual({ reason: null, detail: null });
    expect(presentableDetail({})).toEqual({ reason: null, detail: null });
    expect(presentableDetail({ pathId: 'x' }).detail).toBeNull();
  });
});
