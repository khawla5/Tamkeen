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
 *
 * "عن المنصة" is the platform's concept in four static tabs (D-129) — no
 * data fetch, so nothing is mocked and the page renders synchronously.
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

  it('about: the four journey stages as tabs, the assessment first and selected', () => {
    renderWithProviders(<LandingPage />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'التقييم',
      'إسناد المسار',
      'دورات المسار',
      'الشهادات',
    ]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    /* Skill-level assessment (D-130) — never interest/matching language. */
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent(/يقيس مستواه/);
    /* Each stage: the paragraph plus exactly three concrete points. */
    expect(within(panel).getAllByRole('listitem')).toHaveLength(3);
  });

  it('about: choosing a stage tab swaps the panel to that stage', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LandingPage />);

    const tab = screen.getByRole('tab', { name: 'الشهادات' });
    await user.click(tab);

    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent(/رقم تحقق/);
  });

  it('about: the assignment panel states the ministry assigns the path — no recommendation language (D-130)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LandingPage />);

    await user.click(screen.getByRole('tab', { name: 'إسناد المسار' }));

    expect(screen.getByRole('tabpanel')).toHaveTextContent(/تُسند الوزارة/);
    expect(screen.getByRole('tabpanel')).not.toHaveTextContent(/موصى به|توصية/);
  });

  it('hero: states who the platform is for (BR-101), and that it measures what training achieves', () => {
    renderWithProviders(<LandingPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'منصة تمكين للتدريب والتطوير المهني وقياس الأثر',
    );
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
    /* The assigned-path model (D-130): the path is the ministry's decision. */
    expect(within(faq).getByText('هل يمكن تغيير المسار بعد إسناده؟')).toBeInTheDocument();
    expect(within(faq).getByText(/لا يبدّل الموظف مساره بنفسه/)).toBeInTheDocument();
    /* Who may register (BR-101) — moved here from the hero, which repeated it
       alongside the header and the explorer's own "إنشاء حساب" action. */
    expect(within(faq).getByText('من يستطيع التسجيل في المنصة؟')).toBeInTheDocument();
    /* No h3 anywhere: the about tabs are buttons, their panel is prose. */
    expect(container.querySelectorAll('h3')).toHaveLength(0);
  });

  it('footer: identity, real quick links only, and policy names as text until their pages exist', () => {
    renderWithProviders(<LandingPage />);

    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByText('وزارة الداخلية')).toBeInTheDocument();
    /* The ministry is the identity; the directorate is not named in the footer. */
    expect(within(footer).queryByText('الإدارة العامة للتدريب')).not.toBeInTheDocument();
    const links = within(footer).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['#about', '/register', '/login']);
    expect(within(footer).getByText('سياسة الخصوصية').closest('a')).toBeNull();
    expect(within(footer).getByText('© وزارة الداخلية')).toBeInTheDocument();
  });

  it('hero: no stat row — an internal platform does not prove scale to its own staff', () => {
    const { container } = renderWithProviders(<LandingPage />);

    expect(container.querySelector('section dl')).toBeNull();
  });

  it('hero: no longer carries its own identifying emblem — the Kingdom map is the whole visual', () => {
    /* The identifying emblem used to sit above the map inside the hero's own
       box. It moved out to `BrandCorner`, fixed at the page's true top-right
       corner and shared by every page of the site, not just this one — so
       the hero box should carry no *second* `/brand/MOI.svg`. The hero
       itself carries no decorative watermark either (tried, dropped —
       a photo backdrop is not where `PageWatermark` belongs); `AboutSection`
       below it does, distinguished generally by its `aria-hidden="true"`
       wrapper — the stable trait any such instance shares, exactly because
       it is never the accessible, identifying mark. */
    const { container } = renderWithProviders(<LandingPage />);

    const hero = container.querySelector('section');
    const emblems = Array.from(hero?.querySelectorAll('img') ?? []).filter((img) => {
      const isMoi = decodeURIComponent(img.getAttribute('src') ?? '').includes('/brand/MOI.svg');
      const isWatermark = img.closest('[aria-hidden="true"]') !== null;
      return isMoi && !isWatermark;
    });
    expect(emblems).toHaveLength(0);
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
