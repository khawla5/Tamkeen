import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/render';

import { SiteHeader } from './site-header';

describe('SiteHeader brand lockup', () => {
  it('leads with the ministry emblem, then the Tamkeen logo — owner before product', () => {
    renderWithProviders(<SiteHeader />);

    const images = screen.getAllByRole('img');
    const names = images.map((img) => img.getAttribute('alt'));
    expect(names.indexOf('وزارة الداخلية')).toBeGreaterThanOrEqual(0);
    expect(names.indexOf('وزارة الداخلية')).toBeLessThan(names.indexOf('تمكين'));
  });

  it('links only the product logo home; the emblem is not a link', () => {
    renderWithProviders(<SiteHeader />);

    expect(screen.getByRole('img', { name: 'تمكين' }).closest('a')).toHaveAttribute(
      'href',
      '/landing',
    );
    expect(screen.getByRole('img', { name: 'وزارة الداخلية' }).closest('a')).toBeNull();
  });
});
