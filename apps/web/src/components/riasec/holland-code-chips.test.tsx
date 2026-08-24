import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import messages from '../../../messages/ar.json';
import { HollandCodeChips } from './holland-code-chips';

function renderChips(props: Parameters<typeof HollandCodeChips>[0]) {
  return render(
    <NextIntlClientProvider locale="ar-u-nu-latn-ca-gregory" messages={messages}>
      <HollandCodeChips {...props} />
    </NextIntlClientProvider>,
  );
}

/** The one rendering of a Holland Code, shared by the dashboard and Results (TAM-108/114). */
describe('HollandCodeChips', () => {
  it('renders the letters as Arabic type names, in rank order, as a list', () => {
    renderChips({ code: ['S', 'I', 'A'] });

    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['الاجتماعي', 'البحثي', 'الفني']);
    expect(screen.queryByText(/SIA|[A-Z]{3}/)).toBeNull();
  });

  it('can number the chips for a page that explains the ranking', () => {
    renderChips({ code: ['R', 'C', 'E'], ordinals: true });

    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toMatch(/^1\.\s*الواقعي$/);
    expect(items[2]).toMatch(/^3\.\s*المبادِر$/);
  });

  it('names the list for assistive technology and uses the accent fill, never gold', () => {
    const { container } = renderChips({ code: ['S', 'I', 'A'] });

    expect(screen.getByRole('list')).toHaveAccessibleName('ميولك المهنية');
    expect(container.innerHTML).toMatch(/bg-accent/);
    expect(container.innerHTML).not.toMatch(/gold/i);
  });
});
