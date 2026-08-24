import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import messages from '../../../messages/ar.json';
import { PasswordInput } from './password-input';

function renderInput() {
  return render(
    <NextIntlClientProvider locale="ar-u-nu-latn-ca-gregory" messages={messages}>
      <label htmlFor="pw">كلمة المرور</label>
      <PasswordInput id="pw" />
    </NextIntlClientProvider>,
  );
}

describe('PasswordInput', () => {
  it('is a password field with a labelled toggle that reveals and hides it', async () => {
    const user = userEvent.setup();
    renderInput();

    const input = screen.getByLabelText('كلمة المرور');
    expect(input).toHaveAttribute('type', 'password');

    const toggle = screen.getByRole('button', { name: 'إظهار كلمة المرور' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'إخفاء كلمة المرور' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('never submits the form from the toggle', () => {
    renderInput();

    expect(screen.getByRole('button', { name: 'إظهار كلمة المرور' })).toHaveAttribute(
      'type',
      'button',
    );
  });
});
