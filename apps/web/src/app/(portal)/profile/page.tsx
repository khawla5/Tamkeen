'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { PortalPage } from '@/components/layout/portal-page';
import { usePortal } from '@/components/layout/portal-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { authApi } from '@/lib/api-client';
import { useApiMutation } from '@/lib/use-api';

/**
 * Profile (§4.12), reduced to what Phase 1 needs.
 *
 * §4.12 also lists change-password, email re-verification and a language
 * setting. Those are deliberately absent: none is a Phase 1 deliverable, and a
 * form that does not work is worse than one that is not there yet. What this
 * page does provide is the reason it exists at all in Phase 1 — §4.2 puts
 * Profile in the pre-assessment navigation, so the link must lead somewhere
 * real, and sign-out needs a home.
 */
export default function ProfilePage() {
  const t = useTranslations('profile');
  const { user } = usePortal();
  const router = useRouter();

  const signOut = useApiMutation(() => authApi.logout());

  const roleLabel =
    user.role === 'SUPER_ADMIN'
      ? t('roleAdmin')
      : user.role === 'ENTITY'
        ? t('roleEntity')
        : t('roleEmployee');

  async function onSignOut() {
    await signOut.run();
    /* Navigate regardless: if the session was already gone the request fails,
       and keeping the user on a page they cannot use would be the wrong
       response to that. */
    router.replace('/login');
  }

  return (
    <PortalPage title={t('title')}>
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>{t('personalHeading')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <dl className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <dt className="text-sm text-muted-foreground">{t('fullName')}</dt>
                <dd className="font-medium">{user.fullName}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-sm text-muted-foreground">{t('email')}</dt>
                {/* The address is Latin script; `dir="ltr"` stops RTL reordering
                    turning it into something that is not the user's address. */}
                <dd dir="ltr" className="text-start font-medium">
                  {user.email}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-sm text-muted-foreground">{t('role')}</dt>
                <dd className="font-medium">{roleLabel}</dd>
              </div>
            </dl>

            <Button
              type="button"
              variant="outline"
              className="self-start"
              disabled={signOut.isPending}
              onClick={() => void onSignOut()}
            >
              {signOut.isPending ? t('signingOut') : t('signOut')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </PortalPage>
  );
}
