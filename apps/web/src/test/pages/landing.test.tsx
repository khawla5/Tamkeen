import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicPathSummary } from '@tamkeen/types';

import LandingPage from '@/app/landing/page';
import { renderWithProviders } from '@/test/render';

/**
 * Public landing page — reachable signed out (§ landing brief, "out of
 * scope: auth/assessment/application functionality"). Tests assert the
 * marketing content and its structure, not product logic, since there is
 * none here.
 *
 * The explorer is now real-paths data (TAM-150), so `publicApi.paths` is
 * mocked rather than left to hit a real endpoint.
 */
const api = vi.hoisted(() => ({ paths: vi.fn() }));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');

  return { ...actual, publicApi: { paths: api.paths } };
});

function path(overrides: Partial<PublicPathSummary> = {}): PublicPathSummary {
  return {
    id: 'path-1',
    name: 'خدمة المتعاملين',
    riasecLetter: 'S',
    description: 'مسار للتعامل المباشر مع الجمهور.',
    skillOutcomes: ['استقبال طلبات المتعاملين', 'معالجة الشكاوى بمهنية'],
    courseCount: 11,
    typicalDurationMinutes: 1215,
    ...overrides,
  };
}

describe('LandingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.paths.mockResolvedValue([
      path(),
      path({ id: 'path-2', name: 'الحوكمة والامتثال', riasecLetter: 'C' }),
    ]);
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

  it('every "إنشاء حساب" action on the page links to registration, not a dead button', () => {
    renderWithProviders(<LandingPage />);

    const registerLinks = screen.getAllByRole('link', { name: /إنشاء حساب/ });
    expect(registerLinks.length).toBeGreaterThan(0);
    for (const link of registerLinks) {
      expect(link).toHaveAttribute('href', '/register');
    }
  });

  it('offers a quiet sign-in link for existing users (header and footer)', () => {
    renderWithProviders(<LandingPage />);

    const signInLinks = screen.getAllByRole('link', { name: 'تسجيل الدخول' });
    expect(signInLinks.length).toBeGreaterThan(0);
    for (const link of signInLinks) {
      expect(link).toHaveAttribute('href', '/login');
    }
  });

  it('renders exactly one h3 — the selected path in the explorer; no card grids', async () => {
    renderWithProviders(<LandingPage />);

    expect(await screen.findAllByRole('heading', { level: 3 })).toHaveLength(1);
  });

  it('the matching strip mentions the 5–10 course range using real numerals', async () => {
    renderWithProviders(<LandingPage />);

    expect(await screen.findByText(/من 5 إلى 10 دورات/)).toBeInTheDocument();
  });

  it('hero: states who the platform is for (BR-101)', () => {
    renderWithProviders(<LandingPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'منصة تمكين للتدريب والتطوير المهني',
    );
  });

  it('explorer: a dropdown of real paths, the first selected, its name shown in the panel', async () => {
    renderWithProviders(<LandingPage />);

    const picker = await screen.findByRole('combobox', { name: 'المسارات التدريبية' });
    const options = within(picker).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'خدمة المتعاملين',
      'الحوكمة والامتثال',
    ]);
    expect(picker).toHaveValue('path-1');
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('خدمة المتعاملين');
  });

  it('explorer: choosing a path from the dropdown updates the panel to that path', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LandingPage />);

    const picker = await screen.findByRole('combobox', { name: 'المسارات التدريبية' });
    await user.selectOptions(picker, 'الحوكمة والامتثال');

    expect(picker).toHaveValue('path-2');
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('الحوكمة والامتثال');
  });

  it('explorer: the panel shows career type, skill outcomes, description, course count and duration — from the API, never typed', async () => {
    renderWithProviders(<LandingPage />);

    /* The panel is a two-column grid — the heading's immediate wrapper is only
       the start column, so its parent is what actually holds both the
       description column and the skill-outcomes column beside it. */
    const panel = (await screen.findByRole('heading', { level: 3 })).closest('div')!.parentElement!;
    /* Career type in Arabic (D-099), never the raw letter. */
    expect(within(panel).getByText('الاجتماعي')).toBeInTheDocument();
    expect(within(panel).queryByText(/^S$/)).not.toBeInTheDocument();
    expect(within(panel).getByText('استقبال طلبات المتعاملين')).toBeInTheDocument();
    expect(within(panel).getByText('معالجة الشكاوى بمهنية')).toBeInTheDocument();
    expect(within(panel).getByText('مسار للتعامل المباشر مع الجمهور.')).toBeInTheDocument();
    expect(within(panel).getByText(/11 دورة متاحة/)).toBeInTheDocument();
    expect(within(panel).getByText(/20 ساعة تدريبية/)).toBeInTheDocument();
    expect(panel.querySelector('a[href="/register"]')).not.toBeNull();
  });

  it('explorer: on an API failure, shows the fallback line and the matching strip — never an error page', async () => {
    api.paths.mockRejectedValue(new Error('down'));
    renderWithProviders(<LandingPage />);

    expect(await screen.findByText('ستظهر المسارات هنا قريبًا.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'المسارات التدريبية' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    /* The strip beneath still renders — it is static copy, not API data. */
    expect(screen.getByText(/من 5 إلى 10 دورات/)).toBeInTheDocument();
  });

  it('hero: no feature pills — the paragraph carries the message', () => {
    const { container } = renderWithProviders(<LandingPage />);

    expect(container.querySelector('section')?.querySelector('ul')).toBeNull();
  });

  it('faq: six questions as native disclosures, closed by default, each answered from a product rule', async () => {
    const { container } = renderWithProviders(<LandingPage />);

    /* The explorer's own h3 arrives asynchronously (its data is fetched);
       waiting for it here is what makes "exactly one h3 on the page" a fair
       check rather than a race against that fetch. */
    await screen.findByRole('heading', { level: 3 });

    const faq = screen.getByRole('region', { name: 'الأسئلة الشائعة' });
    const items = faq.querySelectorAll('details');
    expect(items).toHaveLength(6);
    for (const item of items) expect(item.open).toBe(false);
    expect(within(faq).getByText('هل يمكن تغيير المسار بعد تأكيده؟')).toBeInTheDocument();
    expect(within(faq).getByText(/مسار واحد لكل موظف/)).toBeInTheDocument();
    /* Who may register (BR-101) — moved here from the hero, which repeated it
       alongside the header and the explorer's own "إنشاء حساب" action. */
    expect(within(faq).getByText('من يستطيع التسجيل في المنصة؟')).toBeInTheDocument();
    expect(container.querySelectorAll('h3')).toHaveLength(1);
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

  it('hero: no longer carries its own emblem — the Kingdom map is the whole visual', () => {
    /* The emblem used to sit above the map inside the hero's own box. It
       moved out to `BrandCorner`, fixed at the page's true top-right corner
       and shared by every page of the site, not just this one — so the hero
       box should have no `/brand/MOI.svg` image of its own left behind. */
    const { container } = renderWithProviders(<LandingPage />);

    const hero = container.querySelector('section');
    const emblem = Array.from(hero?.querySelectorAll('img') ?? []).find((img) =>
      decodeURIComponent(img.getAttribute('src') ?? '').includes('/brand/MOI.svg'),
    );
    expect(emblem).toBeUndefined();
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
