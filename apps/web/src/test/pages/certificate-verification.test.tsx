import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CertificateVerificationView } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * The public verification page (§2, §4.10, D-016).
 *
 * The assertions that matter here are about **absence**. A third party holding
 * a certificate may learn that it is genuine, whose it is, what it is for and
 * when it was issued — and must not learn the holder's employee number, email,
 * department or quiz grade. So each case checks what is missing as carefully as
 * what is shown.
 */

const api = vi.hoisted(() => ({ verify: vi.fn() }));

class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

vi.mock('@/lib/api-client', () => ({
  certificatesApi: { verify: api.verify },
  ApiError,
}));

const { CertificateVerification } =
  await import('@/app/verify/[verificationId]/certificate-verification');

const COURSE_CERTIFICATE: CertificateVerificationView = {
  type: 'COURSE',
  holderName: 'سارة بنت أحمد القحطاني',
  subjectTitle: 'أساسيات القيادة الإدارية',
  issuedAt: '2026-08-19T09:30:00.000Z',
  valid: true,
};

const VERIFICATION_ID = 'k7Qz2Xr9TfLmA4vN8bYcJ1sWdEpHgU6oRt3iZnQxKvM';

const renderPage = () =>
  renderWithProviders(<CertificateVerification verificationId={VERIFICATION_ID} />);

describe('certificate verification page', () => {
  beforeEach(() => {
    api.verify.mockReset();
  });

  it('shows a loading state while the lookup is in flight', () => {
    api.verify.mockReturnValue(new Promise(() => undefined));

    renderPage();

    expect(screen.getByText('جارٍ التحقق من الشهادة…')).toBeInTheDocument();
  });

  it('states plainly that a real certificate is valid', async () => {
    api.verify.mockResolvedValue(COURSE_CERTIFICATE);

    renderPage();

    expect(await screen.findByText('شهادة صحيحة')).toBeInTheDocument();
    expect(screen.getByText('سارة بنت أحمد القحطاني')).toBeInTheDocument();
    expect(screen.getByText('أساسيات القيادة الإدارية')).toBeInTheDocument();
  });

  it('formats the issue date through the shared layer, not the raw ISO string', async () => {
    /* D-018: every user-visible date goes through format.ts, so the digit and
       calendar switch reaches this page like everywhere else. */
    api.verify.mockResolvedValue(COURSE_CERTIFICATE);

    renderPage();

    expect(await screen.findByText('19 أغسطس 2026')).toBeInTheDocument();
    expect(screen.queryByText(/2026-08-19T/)).not.toBeInTheDocument();
  });

  it('names a course certificate and a path certificate differently', async () => {
    api.verify.mockResolvedValue(COURSE_CERTIFICATE);
    const { unmount } = renderPage();
    expect(await screen.findByText('الدورة')).toBeInTheDocument();
    unmount();

    api.verify.mockResolvedValue({
      ...COURSE_CERTIFICATE,
      type: 'PATH',
      subjectTitle: 'مسار القيادة الإدارية',
    });
    renderPage();

    expect(await screen.findByText('المسار')).toBeInTheDocument();
  });

  it('shows nothing beyond the name, subject and date', async () => {
    /*
     * The privacy rule, asserted on the rendered text. The API cannot send
     * these fields at all — this is the second line of defence, and the one
     * that fails if someone later adds them to the view model.
     */
    api.verify.mockResolvedValue(COURSE_CERTIFICATE);

    const { container } = renderPage();
    await screen.findByText('شهادة صحيحة');

    const text = container.textContent ?? '';

    expect(text).not.toMatch(/@/); // no email
    expect(text).not.toMatch(/\d{2,}%/); // no grade
    expect(text).not.toContain('إدارة الموارد البشرية'); // no department
    expect(text).not.toContain(VERIFICATION_ID); // the id is not worth reprinting
  });

  it('treats an unknown certificate as not found, with no retry offered', async () => {
    /* A 404 is far more often a mistyped or half-scanned link than a forgery,
       so it gets a calm explanation rather than an error with a retry button —
       retrying resolves nothing. */
    api.verify.mockRejectedValue(new ApiError('CERTIFICATE_NOT_FOUND', 404));

    renderPage();

    expect(await screen.findByText('لم يتم العثور على هذه الشهادة')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إعادة المحاولة' })).not.toBeInTheDocument();
    expect(screen.queryByText('شهادة صحيحة')).not.toBeInTheDocument();
  });

  it('offers a retry when the lookup itself failed', async () => {
    /* Distinct from a 404: the network or the API is down, and trying again is
       the right action. */
    api.verify.mockRejectedValue(new Error('network down'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.queryByText('لم يتم العثور على هذه الشهادة')).not.toBeInTheDocument();
  });

  it('is a single-heading page with a main landmark', async () => {
    api.verify.mockResolvedValue(COURSE_CERTIFICATE);

    renderPage();
    await screen.findByText('شهادة صحيحة');

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
