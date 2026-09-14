import { screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CourseDetail } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * Course detail (§4.7, TAM-128): the header carries the summary, the meta row
 * and the one server-chosen action; the content card carries only what §4.7
 * actually asks for.
 *
 * The action's *logic* — which of the five values `resolveCourseAction` returns
 * — is the API's contract, proven against a real database in
 * journey.e2e-spec.ts. What is asserted here is that each value renders its
 * correct label in the header slot, not buried at the bottom of the page.
 *
 * There is no "add to my path" here any more (D-134): a learner does not choose
 * what their path contains, so the only outward actions left are entering a
 * course and opening the certificate it earned.
 */

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
}));

vi.mock('@/lib/api-client', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/api-client')>()),
  coursesApi: { detail: mocks.detail },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ courseId: 'course-1' }),
}));

vi.mock('@/components/layout/portal-page', () => ({
  PortalPage: ({
    title,
    action,
    children,
  }: {
    title: string;
    action?: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      {/* The header row, exactly as AppShell renders it (§3: at most one
          action beside the title) — asserting the action lands here, not
          buried in the page body, is the whole point of TAM-128. */}
      <div data-testid="header-action">{action}</div>
      {children}
    </div>
  ),
}));

const { default: CourseDetailPage } = await import('@/app/(portal)/courses/[courseId]/page');

function course(overrides: Partial<CourseDetail> = {}): CourseDetail {
  return {
    id: 'course-1',
    moodleCourseId: 101,
    title: 'أساسيات إدارة المشاريع',
    summary: 'مقدمة في أدوات ومبادئ إدارة المشاريع.',
    durationMinutes: 180,
    status: 'AVAILABLE',
    language: 'AR',
    paths: [],
    objectives: [],
    prerequisites: null,
    action: 'NONE',
    pathId: null,
    personalStatus: null,
    certificateId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function renderCourse(overrides: Partial<CourseDetail> = {}) {
  mocks.detail.mockResolvedValue(course(overrides));
  renderWithProviders(<CourseDetailPage />);
  await screen.findByText('أساسيات إدارة المشاريع');
}

describe('course detail — header and meta row', () => {
  it('shows the summary and duration, and omits the meta row when there is nothing for it', async () => {
    await renderCourse({ durationMinutes: null });

    expect(screen.getByText('مقدمة في أدوات ومبادئ إدارة المشاريع.')).toBeInTheDocument();
    expect(screen.queryByText(/المدة التقريبية/)).not.toBeInTheDocument();
  });

  it('shows duration as text, in western digits', async () => {
    await renderCourse({ durationMinutes: 180 });

    expect(screen.getByText('المدة التقريبية: 3 ساعة')).toBeInTheDocument();
  });

  it('shows path membership as quiet tags, not a comma-joined list', async () => {
    await renderCourse({
      paths: [
        { id: 'p1', name: 'مسار خدمة المتعاملين', level: null },
        { id: 'p2', name: 'مسار القيادة', level: null },
      ],
    });

    expect(screen.getByText('مسار خدمة المتعاملين')).toBeInTheDocument();
    expect(screen.getByText('مسار القيادة')).toBeInTheDocument();
    expect(screen.queryByText('مسار خدمة المتعاملين، مسار القيادة')).not.toBeInTheDocument();
  });

  it('shows exactly one personal-status chip when the course is in an assigned path', async () => {
    await renderCourse({ action: 'START_COURSE', personalStatus: 'NOT_STARTED' });

    expect(screen.getByText('في مسارك')).toBeInTheDocument();
  });

  it('shows the in-progress chip, reusing my-path’s own wording', async () => {
    await renderCourse({ action: 'START_COURSE', personalStatus: 'IN_PROGRESS' });

    expect(screen.getByText('قيد التنفيذ')).toBeInTheDocument();
  });

  it('shows no personal-status chip for a course outside every assigned path — absence is the signal', async () => {
    await renderCourse({ action: 'NONE', personalStatus: null });

    expect(screen.queryByText('في مسارك')).not.toBeInTheDocument();
    expect(screen.queryByText('قيد التنفيذ')).not.toBeInTheDocument();
    expect(screen.queryByText('مكتملة')).not.toBeInTheDocument();
  });
});

describe('course detail — content sections (unchanged rules)', () => {
  it('shows objectives and omits an empty objectives heading', async () => {
    await renderCourse({ objectives: ['هدف أول', 'هدف ثانٍ'] });

    expect(screen.getByRole('heading', { name: 'أهداف الدورة' })).toBeInTheDocument();
    expect(screen.getByText('هدف أول')).toBeInTheDocument();
  });

  it('omits the objectives heading entirely when there are none', async () => {
    await renderCourse({ objectives: [] });

    expect(screen.queryByRole('heading', { name: 'أهداف الدورة' })).not.toBeInTheDocument();
  });

  it('omits the prerequisites heading when there are none — not an empty section', async () => {
    await renderCourse({ prerequisites: null });

    expect(screen.queryByRole('heading', { name: 'المتطلبات السابقة' })).not.toBeInTheDocument();
  });

  it('shows the certificate line as a quiet footnote regardless of state', async () => {
    await renderCourse();

    expect(screen.getByText('يمنح إتمام هذه الدورة شهادة إتمام.')).toBeInTheDocument();
  });

  it('has a back link to the catalogue', async () => {
    await renderCourse();

    expect(screen.getByRole('link', { name: 'عودة إلى الدورات' })).toHaveAttribute(
      'href',
      '/courses',
    );
  });
});

describe('course detail — the one action, in the header', () => {
  it('offers nothing when action is NONE — browsing without a button that cannot act', async () => {
    await renderCourse({ action: 'NONE' });

    expect(screen.getByTestId('header-action')).toBeEmptyDOMElement();
  });

  it('BELOW_LEVEL: says why, and offers nothing to click', async () => {
    /* Absence, not a disabled button: the course is not pending, it is ground
       the placement says the learner already covered (§3, D-134). */
    await renderCourse({ action: 'BELOW_LEVEL', pathId: 'path-9' });

    const header = screen.getByTestId('header-action');
    expect(header).toHaveTextContent('دون مستواك في المسار');
    expect(within(header).queryByRole('button')).toBeNull();
    expect(within(header).queryByRole('link')).toBeNull();
  });

  it('offers no way to add a course to a path — nobody builds one', async () => {
    /* D-134 retired the build flow entirely. A leftover button here would be an
       action the server has no endpoint for. */
    for (const action of ['NONE', 'START_COURSE', 'BELOW_LEVEL', 'UNAVAILABLE'] as const) {
      const view = renderWithProviders(<CourseDetailPage />);
      mocks.detail.mockResolvedValue(course({ action }));
      await screen.findAllByText('أساسيات إدارة المشاريع');

      expect(screen.queryByRole('button', { name: /أضف/ })).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('START_COURSE, not yet attempted: links to the player as «ابدأ الدورة»', async () => {
    await renderCourse({ action: 'START_COURSE', personalStatus: 'NOT_STARTED' });

    expect(screen.getByRole('link', { name: 'ابدأ الدورة' })).toHaveAttribute(
      'href',
      '/courses/course-1/player',
    );
  });

  it('START_COURSE, already in progress: the same link reads «أكمل الدورة» (§4.7, TAM-128)', async () => {
    await renderCourse({ action: 'START_COURSE', personalStatus: 'IN_PROGRESS' });

    expect(screen.getByRole('link', { name: 'أكمل الدورة' })).toHaveAttribute(
      'href',
      '/courses/course-1/player',
    );
  });

  it('COMPLETED with a certificate: the action becomes a link to it', async () => {
    await renderCourse({
      action: 'COMPLETED',
      personalStatus: 'COMPLETED',
      certificateId: 'cert-1',
    });

    const link = screen.getByRole('link', { name: 'مكتملة — عرض الشهادة' });
    expect(link).toHaveAttribute('href', expect.stringContaining('/api/certificates/cert-1/file'));
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('COMPLETED without a certificate yet: falls back to the static label, not a broken link', async () => {
    await renderCourse({ action: 'COMPLETED', personalStatus: 'COMPLETED', certificateId: null });

    expect(screen.queryByRole('link', { name: /مكتملة/ })).not.toBeInTheDocument();
    /* Twice, legitimately: the header's static fallback pill and the meta
       row's personal-status chip both say "مكتملة" here — not a duplication
       bug, just the same true fact stated in two different places on the
       page. */
    expect(screen.getAllByText('مكتملة')).toHaveLength(2);
  });

  it('UNAVAILABLE: states why, offers nothing to click', async () => {
    await renderCourse({ action: 'UNAVAILABLE' });

    expect(screen.getByText(/لم تعد هذه الدورة متاحة/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /غير متاحة/ })).not.toBeInTheDocument();
  });

  it('never renders more than one action', async () => {
    await renderCourse({ action: 'START_COURSE' });

    const header = screen.getByTestId('header-action');
    const controls = [...header.querySelectorAll('a, button')];
    expect(controls).toHaveLength(1);
  });
});
