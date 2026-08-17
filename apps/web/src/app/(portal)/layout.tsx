import type { ReactNode } from 'react';

import { PortalProvider } from '@/components/layout/portal-provider';

/**
 * Everything under this route group is authenticated.
 *
 * The sign-in, registration and password pages sit outside it, so they never
 * pay for the session lookup and can never be caught by the redirect that would
 * otherwise send an unauthenticated visitor from /login to /login.
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return <PortalProvider>{children}</PortalProvider>;
}
