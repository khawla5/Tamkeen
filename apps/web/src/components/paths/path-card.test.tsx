import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { PathSummary } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';
import { PathCard } from './path-card';

/**
 * The gold treatment (§3A, §4.4) — the single most visible product rule in the
 * UI, and the one a styling change is most likely to break silently.
 */

function summary(overrides: Partial<PathSummary> = {}): PathSummary {
  return {
    id: 'path-1',
    name: 'خدمة المتعاملين',
    description: 'مسار للتعامل المباشر مع الجمهور.',
    riasecLetter: 'S',
    typicalDurationMinutes: 1200,
    courseCount: 11,
    displayOrder: 1,
    recommended: false,
    recommendationRank: null,
    ...overrides,
  };
}

describe('PathCard', () => {
  it('shows the path name, its RIASEC type in Arabic, and the course count', () => {
    renderWithProviders(<PathCard path={summary()} />);

    expect(screen.getByRole('heading', { name: 'خدمة المتعاملين' })).toBeInTheDocument();
    expect(screen.getByText('الاجتماعي')).toBeInTheDocument();
    expect(screen.getByText('11 دورة متاحة')).toBeInTheDocument();
  });

  it('marks a recommended path with the Arabic badge, not colour alone', () => {
    /* WCAG 1.4.1: a gold border says nothing to a user who cannot distinguish
       it. The word "موصى به" is what actually carries the recommendation. */
    renderWithProviders(<PathCard path={summary({ recommended: true, recommendationRank: 0 })} />);

    expect(screen.getByText('موصى به')).toBeInTheDocument();
  });

  it('shows no badge on a path outside the user’s code', () => {
    renderWithProviders(<PathCard path={summary()} />);

    expect(screen.queryByText('موصى به')).not.toBeInTheDocument();
  });

  it('uses the primary border for a recommendation and a plain one otherwise', () => {
    const { container: gold } = renderWithProviders(
      <PathCard path={summary({ recommended: true, recommendationRank: 1 })} />,
    );
    expect(gold.querySelector('article')?.className).toContain('border-primary-600');

    const { container: plain } = renderWithProviders(<PathCard path={summary()} />);
    expect(plain.querySelector('article')?.className).not.toContain('border-primary-600');
  });

  it('carries the recommendation on the primary colour only — no gold anywhere', () => {
    /*
     * D-069: the product does not use Platforms Code's gold secondary. The
     * recommendation is the primary border plus the badge text; a `gold`
     * utility reappearing here would be a regression to a retired token.
     */
    const { container } = renderWithProviders(
      <PathCard path={summary({ recommended: true, recommendationRank: 0 })} />,
    );

    expect(container.innerHTML).not.toMatch(/gold/i);
  });

  it('offers exactly one action, and it does not pre-select the path', () => {
    /* §3A: "the user must actively choose" — gold is a highlight, so the card
       links to the path rather than selecting it. */
    renderWithProviders(<PathCard path={summary({ recommended: true, recommendationRank: 0 })} />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/paths/path-1');
    expect(links[0]).toHaveTextContent('استعرض المسار');
  });

  it('omits the duration when the path does not state one', () => {
    renderWithProviders(<PathCard path={summary({ typicalDurationMinutes: null })} />);

    expect(screen.queryByText(/المدة التقريبية/)).not.toBeInTheDocument();
  });
});
