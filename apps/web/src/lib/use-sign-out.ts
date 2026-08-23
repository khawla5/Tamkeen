'use client';

import { authApi } from '@/lib/api-client';
import { useApiMutation } from '@/lib/use-api';
import { useAppRouter } from '@/lib/use-app-router';

/**
 * Signing out, the one way it happens anywhere in the app: revoke the session
 * on the server, then go to the sign-in page — regardless of whether the
 * request succeeded. If the session was already gone the request fails, and
 * keeping the user on a page they cannot use would be the wrong response to
 * that. The sidebar footer and the profile page both call this, so the two
 * buttons cannot drift.
 */
export function useSignOut() {
  const router = useAppRouter();
  const mutation = useApiMutation(() => authApi.logout());

  async function signOut() {
    await mutation.run();
    router.replace('/login');
  }

  return { signOut, isPending: mutation.isPending };
}
