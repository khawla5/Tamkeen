import { screen, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CertificateSummary } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * The certificates gallery (§4.10).
 *
 * §4.10 is unusually specific — "title, date earned, view, download (PDF).
 * Nothing else" — so as much of this suite is about absence as presence. The
 * other thing worth pinning is that the two actions are real links to the API
 * rather than fetch-and-blob, because that is what makes the browser's own PDF
 * viewer and download handling do the work.
 */

const api = vi.hoisted(() => ({
  list: vi.fn(),
  markCertificatesRead: vi.fn(),
  refreshNotifications: vi.fn(),
  unreadCertificates: { current: 0 },
  fileUrl: vi.fn(
    (id: string, disposition: string) =>
      `http://api.test/api/certificates/${id}/file${
        disposition === 'attachment' ? '?disposition=attachment' : ''
      }`,
  ),
}));

vi.mock('@/lib/api-client', () => ({
  certificatesApi: { list: api.list, fileUrl: api.fileUrl },
  notificationsApi: { markCertificatesRead: api.markCertificatesRead },
}));

vi.mock('@/components/layout/portal-provider', () => ({
  usePortal: () => ({
    unreadCertificates: api.unreadCertificates.current,
    refreshNotifications: api.refreshNotifications,
  }),
}));

vi.mock('@/components/layout/portal-page', () => ({
  PortalPage: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const { default: CertificatesPage } = await import('@/app/(portal)/certificates/page');

const COURSE: CertificateSummary = {
  id: 'cert-course-1',
  type: 'COURSE',
  subjectTitle: 'أساسيات القيادة الإدارية',
  issuedAt: '2026-08-10T09:00:00.000Z',
};

const PATH: CertificateSummary = {
  id: 'cert-path-1',
  type: 'PATH',
  subjectTitle: 'مسار القيادة الإدارية',
  issuedAt: '2026-08-18T09:00:00.000Z',
};

describe('certificates gallery', () => {
  beforeEach(() => {
    api.list.mockReset();
    api.markCertificatesRead.mockReset();
    api.markCertificatesRead.mockResolvedValue(undefined);
    api.refreshNotifications.mockReset();
    api.unreadCertificates.current = 0;
  });

  it('shows a loading state first', () => {
    api.list.mockReturnValue(new Promise(() => undefined));

    renderWithProviders(<CertificatesPage />);

    expect(screen.getByText('جارٍ التحميل…')).toBeInTheDocument();
  });

  it('explains how the first certificate arrives when there are none', async () => {
    /* The empty state a learner sees the day they start a path — it says the
       certificate comes automatically, so nobody goes looking for a button. */
    api.list.mockResolvedValue([]);

    renderWithProviders(<CertificatesPage />);

    expect(await screen.findByText('لا توجد شهادات بعد')).toBeInTheDocument();
    expect(
      screen.getByText('تصدر شهادتك تلقائياً بمجرد اجتيازك أول دورة في مسارك.'),
    ).toBeInTheDocument();
  });

  it('shows an error with a retry when the list fails', async () => {
    api.list.mockRejectedValue(new Error('network down'));

    renderWithProviders(<CertificatesPage />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument();
  });

  it('lists each certificate with its title and issue date', async () => {
    api.list.mockResolvedValue([PATH, COURSE]);

    renderWithProviders(<CertificatesPage />);

    expect(await screen.findByText('مسار القيادة الإدارية')).toBeInTheDocument();
    expect(screen.getByText('أساسيات القيادة الإدارية')).toBeInTheDocument();
    /* Dates through format.ts (D-018), never a raw ISO string. */
    expect(screen.getByText('صدرت في 18 أغسطس 2026')).toBeInTheDocument();
    expect(screen.getByText('صدرت في 10 أغسطس 2026')).toBeInTheDocument();
  });

  it('distinguishes the path certificate from a course certificate', async () => {
    api.list.mockResolvedValue([PATH, COURSE]);

    renderWithProviders(<CertificatesPage />);

    expect(await screen.findByText('شهادة مسار')).toBeInTheDocument();
    expect(screen.getByText('شهادة دورة')).toBeInTheDocument();
  });

  it('offers view and download as real links to the stored PDF', async () => {
    /* Not fetch-and-blob: the browser's PDF viewer and its download handling
       are better than anything we would build, and a link carries the session
       cookie the way any navigation does. */
    api.list.mockResolvedValue([COURSE]);

    renderWithProviders(<CertificatesPage />);

    const view = await screen.findByRole('link', {
      name: 'عرض شهادة أساسيات القيادة الإدارية',
    });
    const download = screen.getByRole('link', {
      name: 'تنزيل شهادة أساسيات القيادة الإدارية',
    });

    expect(view).toHaveAttribute('href', 'http://api.test/api/certificates/cert-course-1/file');
    expect(view).toHaveAttribute('target', '_blank');
    expect(view).toHaveAttribute('rel', expect.stringContaining('noopener') as unknown as string);
    expect(download).toHaveAttribute(
      'href',
      'http://api.test/api/certificates/cert-course-1/file?disposition=attachment',
    );
  });

  it('names each action after its certificate, not just "view"', async () => {
    /* Two cards produce four identical-looking buttons; without the title in
       the accessible name a screen-reader user cannot tell them apart. */
    api.list.mockResolvedValue([PATH, COURSE]);

    renderWithProviders(<CertificatesPage />);

    expect(
      await screen.findByRole('link', { name: 'عرض شهادة مسار القيادة الإدارية' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'تنزيل شهادة مسار القيادة الإدارية' }),
    ).toBeInTheDocument();
  });

  it('shows nothing §4.10 excluded', async () => {
    /* No grade, no progress, no verification id — the spec says "nothing
       else", and a gallery is not a transcript. */
    api.list.mockResolvedValue([PATH, COURSE]);

    const { container } = renderWithProviders(<CertificatesPage />);
    await screen.findByText('مسار القيادة الإدارية');

    const text = container.textContent ?? '';

    expect(text).not.toMatch(/%/);
    expect(text).not.toContain('الدرجة');
    expect(text).not.toContain('cert-course-1');
  });
  describe('the in-app indicator (§2)', () => {
    it('clears itself when the gallery is opened', async () => {
      /* Arriving here *is* the acknowledgement — the indicator points at
         exactly one destination, so a separate "mark as read" control would be
         a second thing to do about a dot. */
      api.unreadCertificates.current = 2;
      api.list.mockResolvedValue([PATH, COURSE]);

      renderWithProviders(<CertificatesPage />);
      await screen.findByText('مسار القيادة الإدارية');

      await waitFor(() => {
        expect(api.markCertificatesRead).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(api.refreshNotifications).toHaveBeenCalled();
      });
    });

    it('writes nothing when there was nothing unseen', async () => {
      /* A learner browsing their own gallery must not send a write on every
         visit. */
      api.unreadCertificates.current = 0;
      api.list.mockResolvedValue([COURSE]);

      renderWithProviders(<CertificatesPage />);
      await screen.findByText('أساسيات القيادة الإدارية');

      expect(api.markCertificatesRead).not.toHaveBeenCalled();
    });

    it('clears once under React’s double-invoked effects', async () => {
      /* StrictMode mounts effects twice in development — the exact reason the
         guard is a ref rather than a plain flag. Without it the learner's
         notifications would be written twice on every visit. */
      api.unreadCertificates.current = 1;
      api.list.mockResolvedValue([COURSE]);

      renderWithProviders(
        <StrictMode>
          <CertificatesPage />
        </StrictMode>,
      );
      await screen.findByText('أساسيات القيادة الإدارية');

      await waitFor(() => {
        expect(api.markCertificatesRead).toHaveBeenCalledTimes(1);
      });
    });

    it('still renders the gallery when clearing the indicator fails', async () => {
      /* Leaving the dot up is the harmless direction: the learner sees it again
         next time rather than losing the news. */
      api.unreadCertificates.current = 1;
      api.markCertificatesRead.mockRejectedValue(new Error('offline'));
      api.list.mockResolvedValue([COURSE]);

      renderWithProviders(<CertificatesPage />);

      expect(await screen.findByText('أساسيات القيادة الإدارية')).toBeInTheDocument();
    });
  });
});
