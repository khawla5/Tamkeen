import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HomePage from './page';

describe('HomePage', () => {
  it('renders the Arabic heading', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'منصة التدريب والتطوير المهني',
    );
  });
});
