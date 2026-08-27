import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import LandingPage from '@/app/landing/page';
import { renderWithProviders } from '@/test/render';

/**
 * Public landing page — reachable signed out (§ landing brief, "out of
 * scope: auth/assessment/application functionality"). Tests assert the
 * marketing content and its structure, not product logic, since there is
 * none here.
 */
describe('LandingPage', () => {
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

  it('renders exactly one h3 — the selected item in the explorer; no card grids', () => {
    renderWithProviders(<LandingPage />);

    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1);
  });

  it('mentions the assessment length and, on the path stage, the 5–10 range using real numerals', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LandingPage />);

    expect(screen.getByText(/نحو 30 عبارة/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'المسار التدريبي' }));
    await user.click(screen.getByRole('button', { name: 'بناء المسار' }));
    expect(screen.getByText(/من 5 إلى 10 دورات/)).toBeInTheDocument();
  });

  it('hero: states who the platform is for, and who may register (BR-101)', () => {
    renderWithProviders(<LandingPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'منصة تمكين للتدريب والتطوير المهني',
    );
    expect(screen.getByText(/التسجيل مقصور على منسوبي الوزارة/)).toBeInTheDocument();
  });

  it('explorer: four stage tabs, the first selected, its first item shown in the detail pane', () => {
    renderWithProviders(<LandingPage />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'التقييم المهني',
      'المسار التدريبي',
      'الدورات',
      'الشهادات والسيرة الذاتية',
    ]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('تقييم الميول المهنية');
  });

  it('explorer: choosing an item updates the detail pane and marks it current', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LandingPage />);

    const item = screen.getByRole('button', { name: 'إعادة التقييم' });
    await user.click(item);
    expect(item).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('إعادة التقييم');
    expect(screen.getByText(/لم يؤكّد مساره/)).toBeInTheDocument();
  });

  it("explorer: switching stage resets to that stage's first item, and the action always leads to registration", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LandingPage />);

    await user.click(screen.getByRole('tab', { name: 'الشهادات والسيرة الذاتية' }));
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('شهادة الدورة');
    const panel = screen.getByRole('tabpanel');
    expect(panel.querySelector('a[href="/register"]')).not.toBeNull();
  });

  it('hero: no feature pills — the paragraph carries the message', () => {
    const { container } = renderWithProviders(<LandingPage />);

    expect(container.querySelector('section')?.querySelector('ul')).toBeNull();
  });

  it('faq: six questions as native disclosures, closed by default, each answered from a product rule', () => {
    const { container } = renderWithProviders(<LandingPage />);

    const faq = screen.getByRole('region', { name: 'الأسئلة الشائعة' });
    const items = faq.querySelectorAll('details');
    expect(items).toHaveLength(6);
    for (const item of items) expect(item.open).toBe(false);
    expect(within(faq).getByText('هل يمكن تغيير المسار بعد تأكيده؟')).toBeInTheDocument();
    expect(within(faq).getByText(/مسار واحد لكل موظف/)).toBeInTheDocument();
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
