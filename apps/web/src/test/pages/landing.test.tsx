import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import LandingPage from '@/app/landing/page';
import { LOCALE_COOKIE } from '@/i18n/config';
import { renderWithProviders } from '@/test/render';

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

/* The language switch refreshes the route so the server re-renders with the
   new cookie; there is no app-router context in jsdom to do that for real. */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn(), replace: vi.fn() }),
}));

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

    const heroLinks = screen.getAllByRole('link', { name: /ابدأ رحلتك/ });
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

  /*
   * Replaces an exact h3 count, which failed the moment the page grew a section
   * and taught nothing when it did. What actually matters for WCAG 1.3.1 is the
   * outline: one h1, and no level skipped on the way down — a jump from h2 to
   * h4 tells a screen-reader user a heading is missing. This holds however many
   * sections the page ends up with.
   */
  it('keeps a valid heading outline: one h1, no skipped levels', () => {
    renderWithProviders(<LandingPage />);

    const levels = screen
      .getAllByRole('heading')
      .map((heading) => Number(heading.tagName.slice(1)));

    expect(levels.filter((level) => level === 1)).toHaveLength(1);
    expect(levels[0]).toBe(1);

    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i], `h${levels[i - 1]} is followed by h${levels[i]}`).toBeLessThanOrEqual(
        levels[i - 1]! + 1,
      );
    }
  });

  it('renders the four ordered steps inside an <ol>', () => {
    const { container } = renderWithProviders(<LandingPage />);

    const ol = container.querySelector('ol');
    expect(ol).not.toBeNull();
    expect(ol?.querySelectorAll('li')).toHaveLength(4);
  });

  /*
   * Replaces an assertion on the old ministry copy's "5-10 courses" line, which
   * this page no longer says. What the check is actually for survives: numbers
   * reach the page through the formatting layer (D-018), so a digit-system
   * switch reaches them too. The hero's grouped figure is the sharpest probe —
   * "1,247" is separator-formatted output, not a literal anyone typed.
   */
  it('renders its figures through the formatting layer, not as literal text', () => {
    renderWithProviders(<LandingPage />);

    expect(screen.getAllByText(/1,247/).length).toBeGreaterThan(0);

    /* The percentage carries bidi isolation marks around the sign — `Intl`
       inserts them so "78%" cannot be reordered inside an RTL paragraph. A
       plain /78%/ does not match, and that mismatch is the formatter doing its
       job, so the matcher allows for them rather than the code dropping them. */
    expect(screen.getAllByText(/78[‎‏]*%/).length).toBeGreaterThan(0);
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
    /* The header's primary reads "ابدأ الآن", not the auth pages' "إنشاء حساب"
       — a marketing label for the same destination (see SiteHeader's comment).
       Asserted by name rather than by position so the two cannot silently
       diverge in what they point at. */
    expect(
      within(mobileNav as HTMLElement).getByRole('link', { name: 'ابدأ الآن' }),
    ).toHaveAttribute('href', '/register');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  /*
   * The guarantee behind the seven-link bar: a nav link that scrolls nowhere is
   * indistinguishable from a broken page. Resolving every href against the
   * rendered DOM catches the two ways that breaks — a section renamed or
   * removed without touching the bar, and a link added ahead of its section.
   * The scroll-margin half is the same failure one step later: without it the
   * sticky header lands on top of the heading the visitor was sent to, so they
   * arrive at a section whose title they cannot see.
   */
  it('points every nav link at a section that exists and clears the sticky header', () => {
    renderWithProviders(<LandingPage />);

    const nav = screen.getAllByRole('navigation', { name: 'التنقل الرئيسي' })[0];
    const anchors = within(nav as HTMLElement)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('#'));

    expect(anchors).toHaveLength(7);

    for (const anchor of anchors) {
      const id = anchor.getAttribute('href')!.slice(1);
      const target = document.getElementById(id);

      expect(target, `nav link #${id} has no target on the page`).not.toBeNull();
      expect(target!.className, `#${id} would sit under the sticky header`).toContain('scroll-mt');
      /* Focus follows the scroll only if the target can hold focus. */
      expect(target!.getAttribute('tabindex'), `#${id} cannot receive focus`).toBe('-1');
    }
  });

  /*
   * The switch is the whole mechanism in one click: it writes the cookie the
   * server reads on the next request and asks for a re-render. Nothing about
   * the language lives in client state, so if the cookie name here and the one
   * `request.ts` reads ever diverge, the button silently does nothing — which
   * is exactly the bug this catches.
   */
  it('switches language by writing the cookie the server reads, then refreshing', async () => {
    renderWithProviders(<LandingPage />);
    const user = userEvent.setup();

    const [switcher] = screen.getAllByRole('button', { name: 'تغيير اللغة' });

    /* It offers the language you are NOT reading. */
    expect(switcher).toHaveTextContent('English');

    await user.click(switcher!);

    expect(document.cookie).toContain(`${LOCALE_COOKIE}=en`);
    expect(mocks.refresh).toHaveBeenCalled();
  });
});
