import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Card, CardContent, CardHeader, CardTitle } from './card';

describe('Card (TAM-118)', () => {
  it('is a plain container with a heading the page outline can see', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>بياناتك</CardTitle>
        </CardHeader>
        <CardContent>محتوى</CardContent>
      </Card>,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'بياناتك' })).toBeInTheDocument();
  });

  it('marks a selected card with the primary edge, and only the edge', () => {
    const { container } = render(<Card variant="selected">موصى به</Card>);
    const card = container.firstElementChild!;

    expect(card.className).toMatch(/border-primary-600/);
    /* An edge, never a fill: the content keeps its own colours (WCAG 1.4.1 —
       the word beside the edge carries the meaning). */
    expect(card.className).not.toMatch(/bg-primary/);
  });

  it('carries a status start-edge for notice cards', () => {
    const { container } = render(<Card edge="warning">تنبيه</Card>);

    expect(container.firstElementChild!.className).toMatch(/border-s-warning/);
  });

  it('passes through a role, so a notice can be an alert', () => {
    render(
      <Card edge="danger" role="alert">
        خطأ
      </Card>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('خطأ');
  });
});
