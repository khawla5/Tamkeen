import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Field } from './field';
import { Input } from './input';

/**
 * The accessibility wiring is the whole point of `Field`, so it is what gets
 * tested: labelled inputs and programmatically-associated errors are WCAG 2.1 AA
 * requirements (§2B DoD 5), not styling preferences.
 */
describe('Field', () => {
  it('associates the label with the input', () => {
    render(
      <Field id="email" label="البريد الإلكتروني">
        {(props) => <Input {...props} />}
      </Field>,
    );

    /* getByLabelText only finds it if the label/input association is correct. */
    expect(screen.getByLabelText(/البريد الإلكتروني/)).toBeInTheDocument();
  });

  it('marks the input invalid and links the error message when there is one', () => {
    render(
      <Field id="email" label="البريد الإلكتروني" error="بريد غير صحيح">
        {(props) => <Input {...props} />}
      </Field>,
    );

    const input = screen.getByLabelText(/البريد الإلكتروني/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('بريد غير صحيح');
  });

  it('announces the error, so it is not silent for screen-reader users', () => {
    render(
      <Field id="email" label="البريد" error="بريد غير صحيح">
        {(props) => <Input {...props} />}
      </Field>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('بريد غير صحيح');
  });

  it('is not marked invalid when there is no error', () => {
    render(
      <Field id="email" label="البريد">
        {(props) => <Input {...props} />}
      </Field>,
    );

    expect(screen.getByLabelText(/البريد/)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('links a hint as the accessible description', () => {
    render(
      <Field id="password" label="كلمة المرور" hint="12 حرفًا على الأقل.">
        {(props) => <Input {...props} />}
      </Field>,
    );

    expect(screen.getByLabelText(/كلمة المرور/)).toHaveAccessibleDescription('12 حرفًا على الأقل.');
  });

  it('marks required fields required for assistive technology', () => {
    render(
      <Field id="email" label="البريد" required>
        {(props) => <Input {...props} />}
      </Field>,
    );

    expect(screen.getByLabelText(/البريد/)).toBeRequired();
  });

  it('keeps the required asterisk out of the accessible name', () => {
    /*
     * Regression test. The marker was originally nested inside the <label>, so
     * the accessible name became "البريد*" and a screen reader announced a
     * spurious "star". An exact-match query is the assertion: it only passes if
     * the label text is the label and nothing else. `required` already conveys
     * the requirement.
     */
    render(
      <Field id="email" label="البريد" required>
        {(props) => <Input {...props} />}
      </Field>,
    );

    expect(screen.getByLabelText('البريد', { exact: true })).toBeRequired();
  });

  it('disambiguates fields whose labels share a suffix', () => {
    /* "كلمة المرور" and "تأكيد كلمة المرور" must be separately addressable —
       an exact query for the shorter one must not match the longer. */
    render(
      <>
        <Field id="password" label="كلمة المرور" required>
          {(props) => <Input {...props} />}
        </Field>
        <Field id="confirmPassword" label="تأكيد كلمة المرور" required>
          {(props) => <Input {...props} />}
        </Field>
      </>,
    );

    expect(screen.getByLabelText('كلمة المرور', { exact: true })).toHaveAttribute('id', 'password');
    expect(screen.getByLabelText('تأكيد كلمة المرور', { exact: true })).toHaveAttribute(
      'id',
      'confirmPassword',
    );
  });

  it('exposes both hint and error together when both are present', () => {
    render(
      <Field id="password" label="كلمة المرور" hint="12 حرفًا" error="قصيرة جدًا">
        {(props) => <Input {...props} />}
      </Field>,
    );

    const description = screen.getByLabelText(/كلمة المرور/).getAttribute('aria-describedby');
    expect(description).toContain('password-error');
    expect(description).toContain('password-hint');
  });
});
