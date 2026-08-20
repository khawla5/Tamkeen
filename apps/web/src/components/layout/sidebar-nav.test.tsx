import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render';

import { STEADY_STATE_NAV } from './nav-items';
import { SidebarNav } from './sidebar-nav';

/**
 * The navigation rail, and the one thing §2 lets it announce.
 *
 * §2 permits "a light indicator when a new certificate is issued. Nothing
 * more." So the tests here are as much about restraint as about presence: a dot
 * and not a count, on exactly one item, and never one that a screen reader
 * cannot perceive.
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

const ITEMS = STEADY_STATE_NAV.filter((item) =>
  ['dashboard', 'courses', 'myPath', 'certificates', 'profile'].includes(item.key),
);

describe('SidebarNav', () => {
  it('renders each item as a link to its page', () => {
    renderWithProviders(<SidebarNav items={ITEMS} />);

    expect(screen.getByRole('link', { name: 'الرئيسية' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'شهاداتي' })).toHaveAttribute('href', '/certificates');
  });

  it('marks the current page for assistive technology (WCAG 2.4.8)', () => {
    renderWithProviders(<SidebarNav items={ITEMS} />);

    expect(screen.getByRole('link', { name: 'الرئيسية' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'الدورات' })).not.toHaveAttribute('aria-current');
  });

  it('shows no indicator when nothing is unseen', () => {
    renderWithProviders(<SidebarNav items={ITEMS} />);

    expect(screen.queryByText('لديك شهادات جديدة')).not.toBeInTheDocument();
  });

  it('announces new certificates in text, not colour alone (WCAG 1.4.1)', () => {
    /* A bare coloured dot conveys nothing to a screen reader, and colour must
       never be the only carrier of meaning — so the dot is aria-hidden and
       paired with visually-hidden text. */
    renderWithProviders(<SidebarNav items={ITEMS} indicators={['certificates']} />);

    const link = screen.getByRole('link', { name: /شهاداتي/ });

    expect(link).toHaveAccessibleName(expect.stringContaining('لديك شهادات جديدة') as never);
  });

  it('puts the indicator on exactly the item it points at', () => {
    renderWithProviders(<SidebarNav items={ITEMS} indicators={['certificates']} />);

    expect(screen.getByRole('link', { name: /لديك شهادات جديدة/ })).toHaveAttribute(
      'href',
      '/certificates',
    );
    expect(screen.getByRole('link', { name: 'الرئيسية' })).toBeInTheDocument();
  });

  it('shows a dot rather than a count', () => {
    /* §2 rules out engagement nagging, and a number invites checking. */
    renderWithProviders(<SidebarNav items={ITEMS} indicators={['certificates']} />);

    const link = screen.getByRole('link', { name: /شهاداتي/ });

    expect(link.textContent).not.toMatch(/\d/);
  });
});
