import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import RegisterPage from '@/app/register/page';
import { DEPARTMENTS } from '@/lib/auth-constants';
import { renderWithProviders } from '@/test/render';

const api = vi.hoisted(() => ({ register: vi.fn() }));

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, authApi: { ...actual.authApi, register: api.register } };
});

const PASSWORD = 'a-long-enough-password';

async function fillStepOne(user: ReturnType<typeof userEvent.setup>, confirm = PASSWORD) {
  await user.type(screen.getByLabelText('البريد الإلكتروني'), 'user@ministry.gov.example');
  await user.type(screen.getByLabelText('كلمة المرور', { exact: true }), PASSWORD);
  await user.type(screen.getByLabelText('تأكيد كلمة المرور'), confirm);
}

async function fillStepTwo(
  user: ReturnType<typeof userEvent.setup>,
  overrides: { fullName?: string; employeeId?: string; department?: string | null } = {},
) {
  await user.type(screen.getByLabelText('الاسم الكامل'), overrides.fullName ?? 'أحمد الموظف');
  await user.type(screen.getByLabelText('الرقم الوظيفي'), overrides.employeeId ?? '1234567890');
  if (overrides.department !== null) {
    await user.selectOptions(
      screen.getByLabelText('الإدارة'),
      overrides.department ?? DEPARTMENTS[0]!,
    );
  }
}

/**
 * Registration as a two-step wizard (TAM-103): account, then employee details.
 * One submit at the end; every server rule is unchanged.
 */
describe('RegisterPage', () => {
  beforeEach(() => {
    api.register.mockReset();
  });

  it('opens on step 1 of 2 — account fields only, with the step named in western digits', () => {
    renderWithProviders(<RegisterPage />);

    expect(screen.getByText('الخطوة 1 من 2')).toBeInTheDocument();
    expect(screen.getByLabelText('البريد الإلكتروني')).toBeInTheDocument();
    expect(screen.queryByLabelText('الاسم الكامل')).toBeNull();
    expect(screen.queryByRole('button', { name: 'إنشاء الحساب' })).toBeNull();
  });

  it('catches a password mismatch at step 1 without sending anything', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    await fillStepOne(user, 'something-else-entirely');
    await user.click(screen.getByRole('button', { name: 'التالي' }));

    expect(screen.getByRole('alert')).toHaveTextContent('كلمتا المرور غير متطابقتين.');
    expect(screen.getByText('الخطوة 1 من 2')).toBeInTheDocument();
    expect(api.register).not.toHaveBeenCalled();
  });

  it('moves to step 2, and going back keeps what was typed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    await fillStepOne(user);
    await user.click(screen.getByRole('button', { name: 'التالي' }));
    expect(screen.getByText('الخطوة 2 من 2')).toBeInTheDocument();
    expect(screen.getByLabelText('الاسم الكامل')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'السابق' }));
    expect(screen.getByLabelText('البريد الإلكتروني')).toHaveValue('user@ministry.gov.example');
    expect(screen.getByLabelText('كلمة المرور', { exact: true })).toHaveValue(PASSWORD);
  });

  it('submits once, at the end, with all six fields, then shows the neutral check-your-email panel', async () => {
    const user = userEvent.setup();
    api.register.mockResolvedValue({ status: 'ok' });
    renderWithProviders(<RegisterPage />);

    await fillStepOne(user);
    await user.click(screen.getByRole('button', { name: 'التالي' }));
    await fillStepTwo(user);
    await user.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));

    expect(api.register).toHaveBeenCalledTimes(1);
    expect(api.register).toHaveBeenCalledWith({
      email: 'user@ministry.gov.example',
      password: PASSWORD,
      fullName: 'أحمد الموظف',
      employeeId: '1234567890',
      department: DEPARTMENTS[0]!,
    });
    expect(
      await screen.findByRole('heading', { name: 'تحقّق من بريدك الإلكتروني' }),
    ).toBeInTheDocument();
  });

  it('a server error about the email sends the user back to step 1 with the message', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('@/lib/api-client');
    api.register.mockRejectedValue(new ApiError('EMAIL_DOMAIN_NOT_ALLOWED', 400));
    renderWithProviders(<RegisterPage />);

    await fillStepOne(user);
    await user.click(screen.getByRole('button', { name: 'التالي' }));
    await fillStepTwo(user);
    await user.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('غير مسجّل ضمن نطاقات الوزارة');
    expect(screen.getByText('الخطوة 1 من 2')).toBeInTheDocument();
    expect(screen.getByLabelText('البريد الإلكتروني')).toHaveValue('user@ministry.gov.example');
  });

  it('a server error about the employee id stays on step 2', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('@/lib/api-client');
    api.register.mockRejectedValue(new ApiError('EMPLOYEE_ID_INVALID', 400));
    renderWithProviders(<RegisterPage />);

    await fillStepOne(user);
    await user.click(screen.getByRole('button', { name: 'التالي' }));
    await fillStepTwo(user);
    await user.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'الرقم الوظيفي يجب أن يتكوّن من عشرة أرقام.',
    );
    expect(screen.getByText('الخطوة 2 من 2')).toBeInTheDocument();
  });

  it('step 2 validates before sending: a malformed employee id, a too-short name, no department', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    await fillStepOne(user);
    await user.click(screen.getByRole('button', { name: 'التالي' }));
    await fillStepTwo(user, { fullName: 'أ', employeeId: 'x', department: null });
    await user.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));

    expect(api.register).not.toHaveBeenCalled();
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent);
    expect(alerts.join(' ')).toMatch(/الاسم الكامل/);
    expect(alerts.join(' ')).toMatch(/الرقم الوظيفي يجب أن يتكوّن من عشرة أرقام/);
    expect(alerts.join(' ')).toMatch(/الإدارة مطلوبة/);
    expect(screen.getByLabelText('الرقم الوظيفي')).toHaveAttribute('aria-invalid', 'true');
  });

  it('step 2 refuses a name containing digits — Western or Arabic-Indic', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    await fillStepOne(user);
    await user.click(screen.getByRole('button', { name: 'التالي' }));
    await fillStepTwo(user, { fullName: 'أحمد ٣ الموظف' });
    await user.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));

    expect(api.register).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'الاسم الكامل لا يجوز أن يحتوي على أرقام.',
    );
  });

  it('the department is a closed list — the shared DEPARTMENTS constant, nothing typed', async () => {
    const user = userEvent.setup();
    const { DEPARTMENTS } = await import('@/lib/auth-constants');
    renderWithProviders(<RegisterPage />);

    await fillStepOne(user);
    await user.click(screen.getByRole('button', { name: 'التالي' }));

    const select = screen.getByRole('combobox', { name: 'الإدارة' });
    const options = [...select.querySelectorAll('option')]
      .map((o) => o.value)
      .filter((v) => v !== '');
    expect(options).toEqual([...DEPARTMENTS]);
  });

  it('step 1 validates the email shape and the password length before advancing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    await user.type(screen.getByLabelText('البريد الإلكتروني'), 'not-an-email');
    await user.type(screen.getByLabelText('كلمة المرور', { exact: true }), 'short');
    await user.type(screen.getByLabelText('تأكيد كلمة المرور'), 'short');
    await user.click(screen.getByRole('button', { name: 'التالي' }));

    expect(screen.getByText('الخطوة 1 من 2')).toBeInTheDocument();
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent);
    expect(alerts.join(' ')).toMatch(/بريدًا إلكترونيًا صحيحًا/);
    expect(alerts.join(' ')).toMatch(/كلمة المرور قصيرة/);
  });
});
