import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Alert } from './alert';

describe('Alert', () => {
  it('an error alert is announced assertively and carries the status colours', () => {
    const { container } = render(<Alert tone="error">بيانات الدخول غير صحيحة</Alert>);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('بيانات الدخول غير صحيحة');
    expect(container.firstElementChild?.className).toMatch(/danger/);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('an info or success alert is a polite status, not an alert', () => {
    render(<Alert tone="success">تم إرسال الرابط</Alert>);

    expect(screen.getByRole('status')).toHaveTextContent('تم إرسال الرابط');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
