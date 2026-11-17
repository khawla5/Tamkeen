'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { PathEditor } from '@/components/admin/path-editor';
import { AdminPage } from '@/components/layout/admin-page';
import { useAppRouter } from '@/lib/use-app-router';

/**
 * §4C.4 — one path's ladder, on its own screen.
 *
 * It lived in a modal until an administrator said the modal was overwhelming,
 * and they were right: the work here is a queue to clear, three rungs to fill
 * and an order to get right — something you scroll, leave and come back to. A
 * dialog gives none of that an address, and nests its scrollbar inside the
 * page's.
 *
 * The route buys one thing beyond room: an address. A ladder can now be
 * bookmarked, opened in a second tab beside the assessment it is waiting on,
 * and linked to directly — none of which a modal reached by clicking a row can
 * offer.
 */
export default function AdminPathPage() {
  const t = useTranslations('admin');
  const router = useAppRouter();
  const params = useParams<{ pathId: string }>();

  return (
    <AdminPage title={t('pathManageTitle')}>
      <div className="space-y-6">
        {/* Back to the list, because a screen reached from one should say so.
            The chevron points the way the language runs. */}
        <Link
          href="/admin/paths"
          className="inline-flex items-center gap-1 text-sm text-primary-700 underline-offset-4 hover:underline"
        >
          <ChevronRight aria-hidden="true" className="size-4" />
          {t('pathsTitle')}
        </Link>

        <PathEditor
          pathId={params.pathId}
          /* Deleting leaves this screen without a subject, so the list is where
             the administrator belongs. `replace`, not `push`: the deleted path's
             URL is not somewhere the back button should return to. */
          onDeleted={() => router.replace('/admin/paths')}
        />
      </div>
    </AdminPage>
  );
}
