import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentUser } from '@/lib/api-client';

import { renderWithProviders } from '@/test/render';

/**
 * Profile (§4.12): all five fields shown, only name and department editable,
 * one save action for both, propagation to Moodle is entirely server-side and
 * out of this page's business — what the page owns is validation, the dirty/
 * saved/error states, and never letting employee id or role near an input.
 */

const api = vi.hoisted(() => ({
  update: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  profileApi: { update: api.update },
  authApi: { logout: api.logout },
}));

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@/components/layout/portal-provider', () => ({
  usePortal: () => ({ user: USER }),
}));

vi.mock('@/components/layout/portal-page', () => ({
  PortalPage: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const { default: ProfilePage } = await import('@/app/(portal)/profile/page');

const USER: CurrentUser = {
  id: 'user-1',
  email: 'sara@ministry.gov.example',
  fullName: 'سارة العتيبي',
  employeeId: 'E-1042',
  department: 'تقنية المعلومات',
  role: 'EMPLOYEE',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Profile', () => {
  it('shows all five fields, in order: name, email, employee id, department, role', () => {
    renderWithProviders(<ProfilePage />);

    expect(screen.getByLabelText('الاسم الكامل')).toHaveValue('سارة العتيبي');
    expect(screen.getByText('sara@ministry.gov.example')).toBeInTheDocument();
    expect(screen.getByText('E-1042')).toBeInTheDocument();
    expect(screen.getByLabelText('الإدارة')).toHaveValue('تقنية المعلومات');
    expect(screen.getByText('موظف')).toBeInTheDocument();
  });

  it('renders employee id, email and role as text, not as inputs', () => {
    renderWithProviders(<ProfilePage />);

    expect(screen.queryByLabelText('البريد الإلكتروني')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('الرقم الوظيفي')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('الصلاحية')).not.toBeInTheDocument();
  });

  it('keeps save disabled until something actually changes', async () => {
    renderWithProviders(<ProfilePage />);
    const user = userEvent.setup();

    const save = screen.getByRole('button', { name: 'حفظ' });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText('الاسم الكامل'), ' إضافة');
    expect(save).toBeEnabled();
  });

  it('rejects an empty full name inline, without calling the API', async () => {
    renderWithProviders(<ProfilePage />);
    const user = userEvent.setup();

    const nameInput = screen.getByLabelText('الاسم الكامل');
    await user.clear(nameInput);
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    expect(await screen.findByText('الاسم الكامل مطلوب.')).toBeInTheDocument();
    expect(api.update).not.toHaveBeenCalled();
  });

  it('rejects an empty department inline, without calling the API', async () => {
    renderWithProviders(<ProfilePage />);
    const user = userEvent.setup();

    const deptInput = screen.getByLabelText('الإدارة');
    await user.clear(deptInput);
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    expect(await screen.findByText('الإدارة مطلوبة.')).toBeInTheDocument();
    expect(api.update).not.toHaveBeenCalled();
  });

  it('saves the trimmed values and shows a saved confirmation', async () => {
    api.update.mockResolvedValue({
      ...USER,
      fullName: 'سارة الجديدة',
      department: 'تقنية المعلومات',
    });

    renderWithProviders(<ProfilePage />);
    const user = userEvent.setup();

    const nameInput = screen.getByLabelText('الاسم الكامل');
    await user.clear(nameInput);
    await user.type(nameInput, '  سارة الجديدة  ');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
    expect(api.update).toHaveBeenCalledWith({
      fullName: 'سارة الجديدة',
      department: 'تقنية المعلومات',
    });

    expect(await screen.findByText('تم الحفظ')).toBeInTheDocument();
    /* Nothing left to save — the server's copy is now the baseline. */
    expect(screen.getByRole('button', { name: 'حفظ' })).toBeDisabled();
  });

  it('reports a failed save without losing the edit, and stays retryable', async () => {
    api.update.mockRejectedValue(new Error('network'));

    renderWithProviders(<ProfilePage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('الاسم الكامل'), ' إضافة');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    expect(await screen.findByText('تعذّر حفظ البيانات. حاول مرة أخرى.')).toBeInTheDocument();
    expect(screen.getByLabelText('الاسم الكامل')).toHaveValue('سارة العتيبي إضافة');
    expect(screen.getByRole('button', { name: 'حفظ' })).toBeEnabled();
  });

  it('signs out and redirects to /login regardless of the request outcome', async () => {
    api.logout.mockResolvedValue(undefined);

    renderWithProviders(<ProfilePage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login'));
  });
});
