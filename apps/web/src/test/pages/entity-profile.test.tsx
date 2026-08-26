import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EntityProfileView } from '@tamkeen/types';

import type { CurrentUser } from '@/lib/api-client';
import { renderWithProviders } from '@/test/render';

/**
 * §4B.6 — the entity's profile, with the employee's editable surface (§4.12):
 * the account name and the organisation's contact in one card, the digits
 * preference, the password. The password and digits cards are shared
 * components covered in profile.test.tsx; what is asserted here is the account
 * card's own rules and that the organisation's *name* stays the ministry's.
 */

const api = vi.hoisted(() => ({
  changePassword: vi.fn(),
  setNumberFormat: vi.fn(),
  updateProfile: vi.fn(),
}));
const provider = vi.hoisted(() => ({
  entity: null as EntityProfileView | null,
  refreshSession: vi.fn(),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      changePassword: api.changePassword,
      setNumberFormat: api.setNumberFormat,
    },
    entityApi: { ...actual.entityApi, updateProfile: api.updateProfile },
  };
});

const USER: CurrentUser = {
  id: 'user-1',
  email: 'entity@authority.gov.example',
  fullName: 'مسؤول الجهة التدريبية',
  employeeId: 'ENT-0001',
  department: 'الهيئة الوطنية للتدريب',
  role: 'ENTITY',
  numberFormat: null,
} as CurrentUser;

vi.mock('@/components/layout/entity-provider', () => ({
  useEntity: () => ({
    user: USER,
    entity: provider.entity,
    refresh: vi.fn(),
    refreshSession: provider.refreshSession,
  }),
}));

vi.mock('@/components/layout/entity-page', () => ({
  EntityPage: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const { default: EntityProfilePage } = await import('@/app/(entity)/entity/profile/page');

const ENTITY: EntityProfileView = {
  id: 'entity-1',
  name: 'الهيئة الوطنية للتدريب',
  contactName: 'خالد الدوسري',
  contactEmail: 'contact@authority.gov.example',
};

beforeEach(() => {
  vi.clearAllMocks();
  provider.entity = ENTITY;
  api.changePassword.mockResolvedValue(undefined);
  api.updateProfile.mockImplementation((input: Partial<EntityProfileView>) =>
    Promise.resolve({ ...ENTITY, ...input }),
  );
});

describe('entity profile — the account card', () => {
  it('shows the account name and contact as editable, the organisation name as not', () => {
    renderWithProviders(<EntityProfilePage />);

    expect(screen.getByLabelText(/الاسم الكامل/)).toHaveValue('مسؤول الجهة التدريبية');
    expect(screen.getByLabelText('جهة الاتصال')).toHaveValue('خالد الدوسري');
    expect(screen.getByLabelText(/بريد جهة الاتصال/)).toHaveValue('contact@authority.gov.example');

    /* The organisation's name is text with a pointer to where it changes
       (D-063), never a field. */
    expect(screen.getByText('الهيئة الوطنية للتدريب')).toBeInTheDocument();
    expect(screen.queryByLabelText('اسم الجهة')).not.toBeInTheDocument();
    expect(screen.getByText('يُدار اسم الجهة من قِبل إدارة النظام.')).toBeInTheDocument();
  });

  it('has nothing to save until something changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EntityProfilePage />);

    const save = screen.getByRole('button', { name: 'حفظ بيانات الحساب والجهة' });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText('جهة الاتصال'), ' — التدريب');
    expect(save).toBeEnabled();
  });

  it('saves name and contact in one request, then refreshes the session', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EntityProfilePage />);

    await user.clear(screen.getByLabelText(/الاسم الكامل/));
    await user.type(screen.getByLabelText(/الاسم الكامل/), 'مسؤولة الجهة ');
    await user.clear(screen.getByLabelText(/بريد جهة الاتصال/));
    await user.type(screen.getByLabelText(/بريد جهة الاتصال/), 'training@authority.gov.example');
    await user.click(screen.getByRole('button', { name: 'حفظ بيانات الحساب والجهة' }));

    await waitFor(() =>
      expect(api.updateProfile).toHaveBeenCalledWith({
        fullName: 'مسؤولة الجهة',
        contactName: 'خالد الدوسري',
        contactEmail: 'training@authority.gov.example',
      }),
    );
    expect(await screen.findByText('تم الحفظ')).toBeInTheDocument();
    /* The name shown in the shell comes from the session, so it is refetched. */
    expect(provider.refreshSession).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'حفظ بيانات الحساب والجهة' })).toBeDisabled();
  });

  it('refuses an empty name and a malformed contact address before asking the server', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EntityProfilePage />);

    await user.clear(screen.getByLabelText(/الاسم الكامل/));
    await user.clear(screen.getByLabelText(/بريد جهة الاتصال/));
    await user.type(screen.getByLabelText(/بريد جهة الاتصال/), 'not-an-address');
    await user.click(screen.getByRole('button', { name: 'حفظ بيانات الحساب والجهة' }));

    expect(await screen.findByText('الاسم الكامل مطلوب.')).toBeInTheDocument();
    expect(screen.getByText('بريد جهة الاتصال غير صالح.')).toBeInTheDocument();
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it('reports a failed save beside the form and keeps what was typed', async () => {
    const { ApiError } = await import('@/lib/api-client');
    api.updateProfile.mockRejectedValue(new ApiError('INTERNAL', 500));

    const user = userEvent.setup();
    renderWithProviders(<EntityProfilePage />);

    await user.type(screen.getByLabelText('جهة الاتصال'), ' إضافة');
    await user.click(screen.getByRole('button', { name: 'حفظ بيانات الحساب والجهة' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('تعذّر حفظ البيانات');
    expect(screen.getByLabelText('جهة الاتصال')).toHaveValue('خالد الدوسري إضافة');
  });
});

describe('entity profile — the rest of the page', () => {
  it('offers the digits preference and the password change, through the shared cards', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EntityProfilePage />);

    expect(screen.getByRole('heading', { name: 'شكل الأرقام' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'تغيير كلمة المرور' })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/كلمة المرور الحالية/), 'the-old-password');
    await user.type(screen.getByLabelText(/كلمة المرور الجديدة/), 'a-new-long-password');
    await user.type(screen.getByLabelText(/تأكيد كلمة المرور/), 'a-new-long-password');
    await user.click(screen.getByRole('button', { name: 'تغيير كلمة المرور' }));

    await waitFor(() =>
      expect(api.changePassword).toHaveBeenCalledWith(
        'the-old-password',
        'a-new-long-password',
        'a-new-long-password',
      ),
    );
  });

  it('has no email-change card: an entity address is outside the ministry domain', () => {
    renderWithProviders(<EntityProfilePage />);

    expect(
      screen.queryByRole('heading', { name: 'تغيير البريد الإلكتروني' }),
    ).not.toBeInTheDocument();
  });

  it('still serves a super-admin with no organisation: no account card, the rest intact', () => {
    provider.entity = null;
    renderWithProviders(<EntityProfilePage />);

    expect(screen.getByText('لا توجد بيانات جهة مرتبطة بهذا الحساب.')).toBeInTheDocument();
    expect(screen.queryByLabelText('جهة الاتصال')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'تغيير كلمة المرور' })).toBeInTheDocument();
  });
});
