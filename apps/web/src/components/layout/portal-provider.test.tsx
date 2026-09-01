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

function renderAt(pathname: string, state: 'PRE_ASSESSMENT' | 'ASSESSED_NO_PATH' | 'ACTIVE_PATH') {
  nav.pathname = pathname;
  api.me.mockResolvedValue(employee);
  api.dashboard.mockResolvedValue({ state, codeString: null, englishLevel: null, path: null });
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
 * The catalogue does not exist for a user who has not taken the assessment
 * (TAM-106, D-071): the sidebar hides it, and the same rule covers the URL.
 */
describe('PortalProvider — pre-assessment courses gate', () => {
  beforeEach(() => {
    nav.replace.mockReset();
  });

  it('sends a pre-assessment visit to /courses back to the dashboard, showing loading, never the page', async () => {
    renderAt('/courses', 'PRE_ASSESSMENT');

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
    expect(screen.queryByText('محتوى الصفحة')).toBeNull();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('covers every route under /courses, including a course detail', async () => {
    renderAt('/courses/abc-123', 'PRE_ASSESSMENT');

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
  });

  it('renders the catalogue normally once the assessment is done', async () => {
    renderAt('/courses', 'ASSESSED_NO_PATH');

    expect(await screen.findByText('محتوى الصفحة')).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('does not touch other pages for a pre-assessment user', async () => {
    renderAt('/profile', 'PRE_ASSESSMENT');

    expect(await screen.findByText('محتوى الصفحة')).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
