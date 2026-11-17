import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminCertificateTemplateView } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4C.7 — the certificate face.
 *
 * **The notice carries the page.** Issued certificates store their rendered
 * bytes (D-052), so an edit here changes the *next* certificate and cannot touch
 * one somebody holds. That is the property that makes a credential a credential
 * — and an administrator who thinks a correction will propagate is one who will
 * not make the correction, so it has to be said where the editing happens.
 *
 * **And the preview must be sandboxed.** It is a whole document rendered inside
 * the portal, built partly from text an administrator typed into a form.
 */

const api = vi.hoisted(() => ({
  certificateTemplate: vi.fn(),
  updateSetting: vi.fn(),
  listUsers: vi.fn(),
  listPaths: vi.fn(),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');

  return { ...actual, adminApi: api };
});

vi.mock('@/components/layout/admin-page', () => ({
  AdminPage: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const { default: AdminTemplatesPage } = await import('@/app/(admin)/admin/templates/page');

function view(overrides: Partial<AdminCertificateTemplateView> = {}): AdminCertificateTemplateView {
  return {
    signatory: { name: '', title: '', issuingBody: 'الجهة المصدرة: وزارة الداخلية' },
    previewHtml: '<html lang="ar" dir="rtl"><body>معاينة</body></html>',
    hasLogo: false,
    ...overrides,
  };
}

describe('Admin certificate template (§4C.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.certificateTemplate.mockResolvedValue(view());
    api.updateSetting.mockResolvedValue({ settings: [], readOnly: [] });
    api.listUsers.mockResolvedValue({
      rows: [
        { id: 'u1', fullName: 'سارة العتيبي', employeeId: 'E-1', email: 's@x.gov' },
        { id: 'u2', fullName: 'خالد الشهري', employeeId: 'E-2', email: 'k@x.gov' },
      ],
      total: 2,
      page: 1,
      pageSize: 25,
    });
    api.listPaths.mockResolvedValue([
      { id: 'p1', name: 'مسار اللغة الإنجليزية' },
      { id: 'p2', name: 'مسار القيادة' },
    ]);
  });

  it('shows the loading state before the template arrives', () => {
    api.certificateTemplate.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<AdminTemplatesPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('offers a retry when the request fails', async () => {
    api.certificateTemplate.mockRejectedValue(new Error('down'));
    renderWithProviders(<AdminTemplatesPage />);

    expect(await screen.findByRole('button', { name: /إعادة/ })).toBeInTheDocument();
  });

  it('says an edit reaches future certificates only, and why that is right', async () => {
    renderWithProviders(<AdminTemplatesPage />);

    expect(await screen.findByText('التعديل يسري على الشهادات القادمة فقط')).toBeInTheDocument();
    /* Not just "it does not apply retroactively" — the reason, so it reads as a
       property rather than a limitation. */
    expect(
      screen.getByText(/شهادة يمكن تعديل شكلها بعد إصدارها ليست وثيقة يُعتمد عليها/),
    ).toBeInTheDocument();
  });

  it('names the missing seal, where the person who can supply it is looking', async () => {
    renderWithProviders(<AdminTemplatesPage />);

    /* The first open blocker since Phase 3, surfaced on the screen rather than
       tracked only in a document nobody reading this page has open. */
    expect(
      await screen.findByText(/لم يُزوَّد النظام بشعار الوزارة وختمها بعد/),
    ).toBeInTheDocument();
  });

  it('stops naming it once a seal exists', async () => {
    api.certificateTemplate.mockResolvedValue(view({ hasLogo: true }));
    renderWithProviders(<AdminTemplatesPage />);

    await screen.findByText('بيانات التوقيع');
    expect(screen.queryByText(/لم يُزوَّد النظام بشعار الوزارة/)).not.toBeInTheDocument();
  });

  it('renders the preview in a sandboxed frame', async () => {
    renderWithProviders(<AdminTemplatesPage />);

    const frame = await screen.findByTitle('معاينة');

    /* A whole document built partly from form text. `sandbox=""` is the most
       restrictive value — no scripts, no forms, no navigation. */
    expect(frame).toHaveAttribute('sandbox', '');
    expect(frame).toHaveAttribute('srcdoc', expect.stringContaining('معاينة'));
  });

  it('says the preview is sample data unless somebody is picked, and is never kept', async () => {
    renderWithProviders(<AdminTemplatesPage />);

    expect(
      await screen.findByText(/ببيانات تجريبية ما لم تختر موظفًا أو مسارًا/),
    ).toBeInTheDocument();
    expect(screen.getByText(/ولا تُحفظ المعاينة ولا تُصدر ولا تُرسل/)).toBeInTheDocument();
  });

  it('starts on the sample: no employee or path asked for', async () => {
    renderWithProviders(<AdminTemplatesPage />);

    await screen.findByLabelText('الموظف');
    expect(api.certificateTemplate).toHaveBeenCalledWith({ userId: undefined, pathId: undefined });
  });

  it('searches employees only, and only after a pause in typing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminTemplatesPage />);

    await user.type(await screen.findByLabelText('الموظف'), 'سارة');

    await waitFor(() =>
      expect(api.listUsers).toHaveBeenLastCalledWith({ q: 'سارة', role: 'EMPLOYEE' }),
    );
    /* One request for the finished word, not one per letter. */
    expect(api.listUsers.mock.calls.filter(([filters]) => filters.q !== undefined)).toHaveLength(1);
  });

  it('is one field: the suggestions are the matches, not a second control', async () => {
    renderWithProviders(<AdminTemplatesPage />);

    const field = await screen.findByLabelText('الموظف');

    expect(field).toHaveAttribute('list', 'preview-employee-options');
    await waitFor(() =>
      expect(
        document.querySelector('#preview-employee-options option[value="سارة العتيبي — E-1"]'),
      ).not.toBeNull(),
    );
    /* The earlier search box beside a list is gone. */
    expect(screen.queryByLabelText('البحث عن موظف للمعاينة')).not.toBeInTheDocument();
  });

  it('draws the preview for the employee that was picked, and back to the sample when cleared', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminTemplatesPage />);

    const field = await screen.findByLabelText('الموظف');
    /* The suggestions arrive after the page does. */
    await waitFor(() =>
      expect(
        document.querySelector('#preview-employee-options option[value="سارة العتيبي — E-1"]'),
      ).not.toBeNull(),
    );

    await user.type(field, 'سارة العتيبي — E-1');

    await waitFor(() =>
      expect(api.certificateTemplate).toHaveBeenLastCalledWith({
        userId: 'u1',
        pathId: undefined,
      }),
    );

    await user.clear(field);

    await waitFor(() =>
      expect(api.certificateTemplate).toHaveBeenLastCalledWith({
        userId: undefined,
        pathId: undefined,
      }),
    );
  });

  it('draws the preview for the path that was picked, and back to the sample', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminTemplatesPage />);

    const path = await screen.findByLabelText('المسار');
    await screen.findByRole('option', { name: 'مسار القيادة' });
    await user.selectOptions(path, 'p2');

    await waitFor(() =>
      expect(api.certificateTemplate).toHaveBeenLastCalledWith({
        userId: undefined,
        pathId: 'p2',
      }),
    );

    await user.selectOptions(path, '');

    await waitFor(() =>
      expect(api.certificateTemplate).toHaveBeenLastCalledWith({
        userId: undefined,
        pathId: undefined,
      }),
    );
  });

  it('offers save only once something has changed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminTemplatesPage />);

    const input = await screen.findByLabelText('اسم الموقِّع');
    expect(screen.queryByRole('button', { name: 'حفظ' })).not.toBeInTheDocument();

    await user.type(input, 'أحمد');

    expect(await screen.findByRole('button', { name: 'حفظ' })).toBeInTheDocument();
  });

  it('writes the three fields through the settings endpoints, not a second writer', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminTemplatesPage />);

    await user.type(await screen.findByLabelText('اسم الموقِّع'), 'أحمد');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    /* One writer for those rows (D-072). A PATCH of its own here would be the
       second, and the two would drift. */
    await waitFor(() =>
      expect(api.updateSetting).toHaveBeenCalledWith('CERT_SIGNATORY_NAME', 'أحمد'),
    );
    expect(api.updateSetting).toHaveBeenCalledTimes(3);
  });

  it('confirms a save, saying what it applies to', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminTemplatesPage />);

    await user.type(await screen.findByLabelText('اسم الموقِّع'), 'أحمد');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/يسري على الشهادات القادمة/),
    );
  });
});
