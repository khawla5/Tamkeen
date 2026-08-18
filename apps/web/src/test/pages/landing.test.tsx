import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import LandingPage from '@/app/page';
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

  it('renders exactly 11 h3 subheadings (3 problem cards + 4 steps + 4 trust cards)', () => {
    renderWithProviders(<LandingPage />);

    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(11);
  });

  it('renders the four ordered steps inside an <ol>', () => {
    const { container } = renderWithProviders(<LandingPage />);

    const ol = container.querySelector('ol');
    expect(ol).not.toBeNull();
    expect(ol?.querySelectorAll('li')).toHaveLength(4);
  });

  it('mentions the 5–10 course range and the assessment length using real numerals', () => {
    renderWithProviders(<LandingPage />);

    expect(screen.getByText(/بين 5 و10 دورات/)).toBeInTheDocument();
    expect(screen.getByText(/من نحو 20 إلى 30 عبارة/)).toBeInTheDocument();
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
    expect(within(mobileNav as HTMLElement).getByRole('link', { name: 'إنشاء حساب' })).toHaveAttribute(
      'href',
      '/register',
    );

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
