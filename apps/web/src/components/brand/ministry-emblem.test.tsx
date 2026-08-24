import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import messages from '../../../messages/ar.json';
import { MinistryEmblem } from './ministry-emblem';

function renderEmblem(props: Parameters<typeof MinistryEmblem>[0] = {}) {
  return render(
    <NextIntlClientProvider locale="ar-u-nu-latn-ca-gregory" messages={messages}>
      <MinistryEmblem {...props} />
    </NextIntlClientProvider>,
  );
}

describe('MinistryEmblem', () => {
  it('is an image named after the ministry, in Arabic', () => {
    renderEmblem();

    const img = screen.getByRole('img', { name: 'وزارة الداخلية' });
    expect(decodeURIComponent(img.getAttribute('src') ?? '')).toContain('/brand/MOI.svg');
  });

  it('is square: width equals the requested height', () => {
    renderEmblem({ height: 44 });

    const img = screen.getByRole('img', { name: 'وزارة الداخلية' });
    expect(img).toHaveAttribute('height', '44');
    expect(img).toHaveAttribute('width', '44');
  });
});
