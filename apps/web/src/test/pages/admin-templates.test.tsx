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

    await screen.findByText('كتلة التوقيع');
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

  it('says the preview uses sample data, not a real employee', async () => {
    renderWithProviders(<AdminTemplatesPage />);

    expect(await screen.findByText(/ليسا لموظف حقيقي/)).toBeInTheDocument();
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
