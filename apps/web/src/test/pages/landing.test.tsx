import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicPathSummary } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * The explorer reads the ministry's real paths (TAM-150), so the page has a
 * dependency now — one public, unauthenticated GET. Mocked here rather than
 * stubbed at `fetch`, so a change to the client's shape fails these tests
 * rather than passing them against a response nobody serves.
 */
const api = vi.hoisted(() => ({ paths: vi.fn() }));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');

  return { ...actual, publicApi: api };
});

const { default: LandingPage } = await import('@/app/landing/page');

function path(overrides: Partial<PublicPathSummary> = {}): PublicPathSummary {
  return {
    id: 'p-1',
    name: 'العمليات الميدانية والسلامة',
    riasecLetter: 'R',
    description: 'يطوّر هذا المسار القدرة على إدارة العمل خارج المكتب.',
    skillOutcomes: ['إدارة موقع ميداني', 'تقدير المخاطر التشغيلية'],
    courseCount: 11,
    typicalDurationMinutes: 1290,
    ...overrides,
  };
}

const PATHS: PublicPathSummary[] = [
  path(),
  path({
    id: 'p-2',
    name: 'تحليل البيانات ودعم القرار',
    riasecLetter: 'I',
    description: 'يطوّر هذا المسار القدرة على تحويل البيانات إلى قرار.',
    skillOutcomes: ['تجهيز البيانات وتنظيفها'],
    courseCount: 9,
    typicalDurationMinutes: 1590,
  }),
];

/**
 * Public landing page — reachable signed out (§ landing brief, "out of
 * scope: auth/assessment/application functionality"). Tests assert the
 * marketing content and its structure, not product logic, since there is
 * none here.
 */
describe('LandingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.paths.mockResolvedValue(PATHS);
  });

  it('renders one h1 and the required landmarks', () => {
    renderWithProviders(<LandingPage />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('has a skip link targeting the main landmark', () => {
    renderWithProviders(<LandingPage />);

    const skipLink = screen.getByRole('link', { name: 'تجاوز إلى المحتوى الرئيسي' });
    expect(skipLink).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('the primary hero action links to registration, not a dead button', () => {
    renderWithProviders(<LandingPage />);

    const heroLinks = screen.getAllByRole('link', { name: /إنشاء حساب/ });
    expect(heroLinks.length).toBeGreaterThan(0);
    for (const link of heroLinks) {
      expect(link).toHaveAttribute('href', '/register');
    }
  });

  it('offers a quiet sign-in link for existing users next to the primary action', () => {
    renderWithProviders(<LandingPage />);

    const signInLinks = screen.getAllByRole('link', { name: 'تسجيل الدخول' });
    expect(signInLinks.length).toBeGreaterThan(0);
    for (const link of signInLinks) {
      expect(link).toHaveAttribute('href', '/login');
    }
  });

  it('renders two h3s — the selected path and the matching strip; no card grids', async () => {
    renderWithProviders(<LandingPage />);

    await screen.findByRole('tab', { name: 'العمليات الميدانية والسلامة' });
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2);
  });

  it('explains how an employee is matched, with the real numbers interpolated', async () => {
    renderWithProviders(<LandingPage />);

    /* The four stages that used to be the explorer are four lines now, and they
       keep the interpolated figures — the assessment's length and the 5-10 rule
       come from the shared constants, never typed into copy. */
    expect(await screen.findByText(/من 30 عبارة/)).toBeInTheDocument();
    expect(screen.getByText(/من 5 إلى 10 دورات/)).toBeInTheDocument();
  });

  it('hero: states who the platform is for, and who may register (BR-101)', () => {
    renderWithProviders(<LandingPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'منصة تمكين للتدريب والتطوير المهني',
    );
    expect(screen.getByText(/التسجيل مقصور على منسوبي الوزارة/)).toBeInTheDocument();
  });

  it('explorer: one tab per path, the first selected, its panel showing what it develops', async () => {
    renderWithProviders(<LandingPage />);

    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'العمليات الميدانية والسلامة',
      'تحليل البيانات ودعم القرار',
    ]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByRole('heading', { level: 3 })).toHaveTextContent(
      'العمليات الميدانية والسلامة',
    );
    expect(within(panel).getByText(/يطوّر هذا المسار/)).toBeInTheDocument();
  });

  it('explorer: names the career type in Arabic, never as a letter', async () => {
    renderWithProviders(<LandingPage />);

    const panel = await screen.findByRole('tabpanel');

    /* D-126: the RIASEC letter is an internal code, and «R» on the ministry's
       front page would name nothing. */
    expect(within(panel).getByText('النمط المهني: الواقعي')).toBeInTheDocument();
  });

  it('explorer: lists the skill outcomes the path produces', async () => {
    renderWithProviders(<LandingPage />);

    const panel = await screen.findByRole('tabpanel');
    const outcomes = within(panel)
      .getAllByRole('listitem')
      .map((item) => item.textContent);

    expect(outcomes).toContain('إدارة موقع ميداني');
    expect(outcomes).toContain('تقدير المخاطر التشغيلية');
  });

  it('explorer: interpolates the course count and duration from the API, never typed', async () => {
    renderWithProviders(<LandingPage />);

    /* Eleven courses, and 1,290 minutes read as hours. A number typed into copy
       is a promise nobody keeps once the catalogue changes. */
    expect(await screen.findByText(/يعرض 11 دورة للاختيار منها/)).toBeInTheDocument();
    expect(screen.getByText(/نحو 22 ساعة تدريبية/)).toBeInTheDocument();
  });

  it('explorer: switching path replaces the panel, and the action always leads to registration', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LandingPage />);

    await user.click(await screen.findByRole('tab', { name: 'تحليل البيانات ودعم القرار' }));

    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByRole('heading', { level: 3 })).toHaveTextContent(
      'تحليل البيانات ودعم القرار',
    );
    expect(within(panel).getByText(/يعرض 9 دورة/)).toBeInTheDocument();
    expect(panel.querySelector('a[href="/register"]')).not.toBeNull();
  });

  it('never renders an error on the ministry front door when the paths cannot be read', async () => {
    api.paths.mockRejectedValue(new Error('down'));
    renderWithProviders(<LandingPage />);

    /* The one place in the product where a failed read must not produce an
       error card: a visitor still learns how the platform works and can still
       register. */
    await waitFor(() =>
      expect(screen.getByText('ستظهر المسارات التدريبية هنا قريبًا.')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /إعادة/ })).not.toBeInTheDocument();
    expect(screen.getByText(/من 5 إلى 10 دورات/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /إنشاء حساب/ }).length).toBeGreaterThan(0);
  });

  it('says nothing about outcomes for a path whose outcomes are not written yet', async () => {
    api.paths.mockResolvedValue([path({ skillOutcomes: [] })]);
    renderWithProviders(<LandingPage />);

    const panel = await screen.findByRole('tabpanel');

    expect(within(panel).queryByText('ما يكتسبه الموظف')).not.toBeInTheDocument();
    expect(within(panel).getByText(/يطوّر هذا المسار/)).toBeInTheDocument();
  });

  it('hero: no feature pills — the paragraph carries the message', () => {
    const { container } = renderWithProviders(<LandingPage />);

    expect(container.querySelector('section')?.querySelector('ul')).toBeNull();
  });

  it('faq: six questions as native disclosures, closed by default, each answered from a product rule', () => {
    renderWithProviders(<LandingPage />);

    const faq = screen.getByRole('region', { name: 'الأسئلة الشائعة' });
    const items = faq.querySelectorAll('details');
    expect(items).toHaveLength(6);
    for (const item of items) expect(item.open).toBe(false);
    /* The two a manager arrives with, first (TAM-150). */
    expect(within(faq).getByText('كيف يُطابَق الموظف بمسار تدريبي؟')).toBeInTheDocument();
    expect(within(faq).getByText('ماذا تثبت شهادة المسار؟')).toBeInTheDocument();
    expect(within(faq).getByText('هل يمكن تغيير المسار بعد تأكيده؟')).toBeInTheDocument();
    expect(within(faq).getByText(/مسار واحد لكل موظف/)).toBeInTheDocument();
    /* Questions, not headings: the section is a list, and an h3 per question
       would put six more entries in the document outline for no gain. */
    expect(faq.querySelectorAll('h3')).toHaveLength(0);
  });

  it('footer: identity, real quick links only, and policy names as text until their pages exist', () => {
    renderWithProviders(<LandingPage />);

    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByText('الإدارة العامة للتدريب')).toBeInTheDocument();
    const links = within(footer).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['#about', '/register', '/login']);
    expect(within(footer).getByText('سياسة الخصوصية').closest('a')).toBeNull();
    expect(within(footer).getByText('© وزارة الداخلية')).toBeInTheDocument();
  });

  it('hero: no stat row — an internal platform does not prove scale to its own staff', () => {
    const { container } = renderWithProviders(<LandingPage />);

    expect(container.querySelector('section dl')).toBeNull();
  });

  it('hero: carries the ministry emblem as its visual, decoratively (the header already names it)', () => {
    const { container } = renderWithProviders(<LandingPage />);

    const hero = container.querySelector('section');
    const figure = hero?.querySelector('img[alt=""]');
    expect(figure).not.toBeNull();
    expect(decodeURIComponent(figure?.getAttribute('src') ?? '')).toContain('/brand/MOI.svg');
  });

  it('hero: the emblem sits over the Kingdom map, all thirteen regions present', () => {
    const { container } = renderWithProviders(<LandingPage />);

    expect(container.querySelector('section')?.querySelectorAll('path[data-region]')).toHaveLength(
      13,
    );
  });

  it('never claims Latin brand/standard names as literal text (Arabic-first, D-001)', () => {
    const { container } = renderWithProviders(<LandingPage />);

    const text = container.textContent ?? '';
    expect(text).not.toMatch(/Moodle|WCAG|PDF/i);
  });
});

describe('SiteHeader mobile menu', () => {
  it('toggles the mobile nav and reflects state via aria-expanded', async () => {
    renderWithProviders(<LandingPage />);
    const user = userEvent.setup();

    const toggle = screen.getByRole('button', { name: 'التنقل الرئيسي' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const mobileNav = document.getElementById('mobile-nav');
    expect(mobileNav).not.toBeNull();
    expect(
      within(mobileNav as HTMLElement).getByRole('link', { name: 'إنشاء حساب' }),
    ).toHaveAttribute('href', '/register');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
