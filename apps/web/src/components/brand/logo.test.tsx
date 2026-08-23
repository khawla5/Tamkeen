import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import messages from '../../../messages/ar.json';
import { Logo } from './logo';

function renderLogo(props: Parameters<typeof Logo>[0] = {}) {
  return render(
    <NextIntlClientProvider locale="ar-u-nu-latn-ca-gregory" messages={messages}>
      <Logo {...props} />
    </NextIntlClientProvider>,
  );
}

describe('Logo', () => {
  it('is an image whose accessible name is the Arabic brand, never the Latin wordmark', () => {
    renderLogo();

    const img = screen.getByRole('img', { name: 'تمكين' });
    /* next/image routes through its optimiser, so the path arrives URL-encoded. */
    expect(decodeURIComponent(img.getAttribute('src') ?? '')).toContain('/brand/tamkeen-logo.png');
    expect(screen.queryByText(/TAMKEEN/)).not.toBeInTheDocument();
  });

  it('scales by height, keeping the lockup proportions', () => {
    renderLogo({ height: 64 });

    const img = screen.getByRole('img', { name: 'تمكين' });
    expect(img).toHaveAttribute('height', '64');
    /* 1216 × 504 source; width follows the ratio so the mark is never squashed. */
    expect(img).toHaveAttribute('width', String(Math.round((64 * 1216) / 504)));
  });

  it('sits on a white tile when placed on a dark surface, so the navy wordmark stays legible', () => {
    const { container } = renderLogo({ onDark: true });

    expect(container.firstElementChild?.className).toContain('bg-surface');
  });
});
