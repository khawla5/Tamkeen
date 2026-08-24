import type { ReactNode } from 'react';

import { AdminProvider } from '@/components/layout/admin-provider';

/**
 * The super-admin portal (§4C, D-075).
 *
 * The third sibling route group, each with its own provider loading exactly what
 * its portal needs. Sign-in routes a SUPER_ADMIN account here; a learner or an
 * entity who arrives is sent back to theirs.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminProvider>{children}</AdminProvider>;
}
