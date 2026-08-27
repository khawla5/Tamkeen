import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { PathSummary } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';
import { PathCard } from './path-card';

/**
 * The recommendation treatment (§3A, §4.4) — the single most visible product
 * rule in the UI, and the one a styling change is most likely to break
 * silently — plus the card's two shapes: choosable, and after commitment.
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

  it('leaves the description to the path page (TAM-113)', () => {
    /* Twelve cards each carrying a paragraph buried the ranking this screen
       exists to show. The description is one click away, on the page the
       card's own action opens. */
    renderWithProviders(<PathCard path={summary()} />);

    expect(screen.queryByText('مسار للتعامل المباشر مع الجمهور.')).not.toBeInTheDocument();
  });

  it('marks a recommended path with the Arabic badge, not colour alone', () => {
    /* WCAG 1.4.1: a coloured border says nothing to a user who cannot
       distinguish it. The word "موصى به" is what actually carries the
       recommendation. */
    renderWithProviders(<PathCard path={summary({ recommended: true, recommendationRank: 0 })} />);

    expect(screen.getByText('موصى به')).toBeInTheDocument();
  });

  it('shows no badge on a path outside the user’s code', () => {
    renderWithProviders(<PathCard path={summary()} />);

    expect(screen.queryByText('موصى به')).not.toBeInTheDocument();
  });

  it('uses the primary border for a recommendation and a plain one otherwise', () => {
    const { container: recommended } = renderWithProviders(
      <PathCard path={summary({ recommended: true, recommendationRank: 1 })} />,
    );
    expect(recommended.querySelector('article')?.className).toContain('border-primary-600');

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
    /* §3A: "the user must actively choose" — the highlight is a
       recommendation, so the card links to the path rather than selecting it. */
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

describe('PathCard — after the path is confirmed (§2, TAM-114)', () => {
  it('marks the chosen path and sends its action to My Path', () => {
    renderWithProviders(<PathCard path={summary()} committedPathId="path-1" />);

    expect(screen.getByText('مسارك')).toBeInTheDocument();

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/my-path');
    expect(links[0]).toHaveTextContent('الانتقال إلى مساري');
  });

  it('does not dress the chosen path as recommended', () => {
    /* The primary accent means *recommended* (§3). A path the user chose from
       outside their code must not acquire that meaning after the fact. */
    renderWithProviders(<PathCard path={summary()} committedPathId="path-1" />);

    expect(screen.queryByText('موصى به')).not.toBeInTheDocument();
  });

  it('leaves every other card with no action at all — not a disabled one', () => {
    /* Switching is impossible, so §3 prefers absence to a control that exists
       only to refuse. */
    renderWithProviders(
      <PathCard
        path={summary({ recommended: true, recommendationRank: 0 })}
        committedPathId="other-path"
      />,
    );

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByText('مسارك')).not.toBeInTheDocument();
    /* Still readable as reference: the recommendation itself is unchanged. */
    expect(screen.getByText('موصى به')).toBeInTheDocument();
  });
});
