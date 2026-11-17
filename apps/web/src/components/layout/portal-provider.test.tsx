import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/ar.json';
import { PortalProvider } from './portal-provider';

const api = vi.hoisted(() => ({
  me: vi.fn(),
  dashboard: vi.fn(),
  unread: vi.fn(),
}));
const nav = vi.hoisted(() => ({ pathname: '/', replace: vi.fn() }));

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    authApi: { ...actual.authApi, me: api.me },
    dashboardApi: { ...actual.dashboardApi, get: api.dashboard },
    notificationsApi: { ...actual.notificationsApi, unread: api.unread },
  };
});

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => nav.pathname,
    useRouter: () => ({ replace: nav.replace, push: vi.fn(), refresh: vi.fn() }),
  };
});

const employee = { id: 'u1', email: 'e@ministry.gov.example', fullName: 'أحمد', role: 'EMPLOYEE' };

function renderAt(pathname: string, state: 'NO_PATH' | 'AWAITING_PLACEMENT' | 'ACTIVE_PATH') {
  nav.pathname = pathname;
  api.me.mockResolvedValue(employee);
  api.dashboard.mockResolvedValue({
    state,
    paths: [],
    latestCertificate: null,
    recentActivity: [],
  });
  api.unread.mockResolvedValue({ count: 0 });
  return render(
    <NextIntlClientProvider locale="ar-u-nu-latn-ca-gregory" messages={messages}>
      <PortalProvider>
        <p>محتوى الصفحة</p>
      </PortalProvider>
    </NextIntlClientProvider>,
  );
}

/**
 * The catalogue does not exist for an employee the ministry has not put on a
 * path (D-071, restated for D-134): the sidebar hides it, and the same rule
 * covers the URL, or the navigation lies about what exists.
 */
describe('PortalProvider — the courses gate', () => {
  beforeEach(() => {
    nav.replace.mockReset();
  });

  it('sends an unassigned visit to /courses back to the dashboard, showing loading, never the page', async () => {
    renderAt('/courses', 'NO_PATH');

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
    expect(screen.queryByText('محتوى الصفحة')).toBeNull();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('covers every route under /courses, including a course detail', async () => {
    renderAt('/courses/abc-123', 'NO_PATH');

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
  });

  it('renders the catalogue once a path has been assigned, placed or not', async () => {
    /* Assigned but still awaiting the assessment: the courses are real and the
       sidebar offers them, so the URL must work too. */
    renderAt('/courses', 'AWAITING_PLACEMENT');

    expect(await screen.findByText('محتوى الصفحة')).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('does not touch other pages for an unassigned employee', async () => {
    renderAt('/profile', 'NO_PATH');

    expect(await screen.findByText('محتوى الصفحة')).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
