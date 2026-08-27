import { screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render';

/**
 * §4.6 — the catalogue's path filter follows the journey: it starts on the
 * learner's own committed path (they arrive here to add a course to it, most
 * often through My Path's quiet add) and on «جميع المسارات» for everyone else.
 */

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  paths: vi.fn(),
  committedPathId: { current: null as string | null },
}));

vi.mock('@/lib/api-client', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/api-client')>()),
  coursesApi: { list: mocks.list },
  pathsApi: { list: mocks.paths },
}));

vi.mock('@/components/layout/portal-provider', () => ({
  usePortal: () => ({
    dashboard: {
      path: mocks.committedPathId.current ? { id: mocks.committedPathId.current } : null,
    },
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

const { default: CoursesPage } = await import('@/app/(portal)/courses/page');

const PATHS = {
  paths: [
    { id: 'path-1', name: 'المحتوى الرقمي والتصميم' },
    { id: 'path-2', name: 'الاتصال المؤسسي والتوعية' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.committedPathId.current = null;
  mocks.paths.mockResolvedValue(PATHS);
  mocks.list.mockResolvedValue([]);
});

describe('courses catalogue — the path filter default', () => {
  it('starts on the learner’s committed path, and the first request is filtered by it', async () => {
    mocks.committedPathId.current = 'path-2';
    renderWithProviders(<CoursesPage />);

    const select = (await screen.findByLabelText('المسار')) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('path-2'));

    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ pathId: 'path-2' }));
  });

  it('starts on «جميع المسارات» when no path is committed', async () => {
    renderWithProviders(<CoursesPage />);

    const select = (await screen.findByLabelText('المسار')) as HTMLSelectElement;
    expect(select.value).toBe('');

    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ pathId: undefined }));
  });
});
