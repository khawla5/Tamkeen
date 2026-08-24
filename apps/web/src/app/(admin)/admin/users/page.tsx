'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { AdminUserRow, UserRole } from '@tamkeen/types';

import { AdminPage } from '@/components/layout/admin-page';
import { CreateUserDialog } from '@/components/admin/create-user-dialog';
import { EntitiesPanel } from '@/components/admin/entities-panel';
import { UserDetailPanel } from '@/components/admin/user-detail-panel';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * §4C.2 — user and organisation management.
 *
 * **One primary action: provisioning an account** (§3). Everything else on the
 * page is a filter, a list, or a decision taken about a row the administrator
 * has already selected — none of which competes with it.
 *
 * The two tabs are not two pages. An administrator onboarding a supplier has to
 * create the organisation before an account can act for it, and splitting those
 * across menu items would make the ordering a thing to discover by failing.
 */
export default function AdminUsersPage() {
  const t = useTranslations('admin');
  const [tab, setTab] = useState<'users' | 'entities'>('users');
  const [creating, setCreating] = useState(false);

  return (
    <AdminPage
      title={t('usersTitle')}
      action={<Button onClick={() => setCreating(true)}>{t('createUser')}</Button>}
    >
      <div className="space-y-6">
        <nav aria-label={t('usersTitle')} className="flex gap-1 border-b border-border">
          <TabButton active={tab === 'users'} onClick={() => setTab('users')}>
            {t('tabAccounts')}
          </TabButton>
          <TabButton active={tab === 'entities'} onClick={() => setTab('entities')}>
            {t('tabEntities')}
          </TabButton>
        </nav>

        {tab === 'users' ? <UsersTab /> : <EntitiesPanel />}
      </div>

      {creating ? <CreateUserDialog onClose={() => setCreating(false)} /> : null}
    </AdminPage>
  );
}

function UsersTab() {
  const t = useTranslations('admin');
  const [q, setQ] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [status, setStatus] = useState<'ACTIVE' | 'SUSPENDED' | ''>('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  const users = useApiQuery(
    () =>
      adminApi.listUsers({
        q: q || undefined,
        role: role || undefined,
        status: status || undefined,
        page,
      }),
    [q, role, status, page],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="user-search" label={t('searchLabel')}>
          {(field) => (
            <Input
              {...field}
              type="search"
              value={q}
              placeholder={t('searchPlaceholder')}
              onChange={(event) => {
                setQ(event.target.value);
                setPage(1);
              }}
            />
          )}
        </Field>

        <Field id="user-role" label={t('filterRole')}>
          {(field) => (
            <select
              {...field}
              value={role}
              onChange={(event) => {
                setRole(event.target.value as UserRole | '');
                setPage(1);
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t('filterAny')}</option>
              <option value="EMPLOYEE">{t('roleEmployee')}</option>
              <option value="ENTITY">{t('roleEntity')}</option>
              <option value="SUPER_ADMIN">{t('roleAdmin')}</option>
            </select>
          )}
        </Field>

        <Field id="user-status" label={t('filterStatus')}>
          {(field) => (
            <select
              {...field}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as 'ACTIVE' | 'SUSPENDED' | '');
                setPage(1);
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t('filterAny')}</option>
              <option value="ACTIVE">{t('statusActive')}</option>
              <option value="SUSPENDED">{t('statusSuspended')}</option>
            </select>
          )}
        </Field>
      </div>

      <DataView
        isLoading={users.isInitialLoad}
        error={users.error}
        onRetry={users.refetch}
        isEmpty={users.data?.rows.length === 0}
        emptyProps={{ title: t('usersEmpty'), body: t('usersEmptyHint') }}
      >
        {users.data ? (
          <>
            <UserTable rows={users.data.rows} onSelect={setSelected} />

            <Pagination
              page={users.data.page}
              pageSize={users.data.pageSize}
              total={users.data.total}
              onChange={setPage}
            />
          </>
        ) : null}
      </DataView>

      {selected ? (
        <UserDetailPanel
          userId={selected}
          onClose={() => setSelected(null)}
          onChanged={() => users.refetch()}
        />
      ) : null}
    </div>
  );
}

function UserTable({ rows, onSelect }: { rows: AdminUserRow[]; onSelect: (id: string) => void }) {
  const t = useTranslations('admin');
  const format = useFormat();

  return (
    /* The table scrolls inside its own container rather than the page: an
       address column plus five others does not fit a narrow viewport, and a
       horizontally scrolling page breaks every other screen on it. */
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[48rem] text-sm">
        <caption className="sr-only">{t('usersTitle')}</caption>
        <thead className="border-b border-border text-start text-muted-foreground">
          <tr>
            <Th>{t('columnName')}</Th>
            <Th>{t('columnEmail')}</Th>
            <Th>{t('columnRole')}</Th>
            <Th>{t('columnStatus')}</Th>
            <Th>{t('columnLastLogin')}</Th>
            <Th>
              <span className="sr-only">{t('columnActions')}</span>
            </Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3 font-medium text-foreground">
                {row.fullName}
                <span className="block text-xs font-normal text-muted-foreground">
                  {row.department}
                </span>
              </td>
              {/* Latin script inside an RTL page reorders without dir="ltr". */}
              <td className="px-4 py-3" dir="ltr">
                {row.email}
              </td>
              <td className="px-4 py-3">
                {row.role === 'ENTITY' && row.entity ? (
                  <span>
                    {t('roleEntity')}
                    <span className="block text-xs text-muted-foreground">{row.entity.name}</span>
                  </span>
                ) : (
                  t(row.role === 'SUPER_ADMIN' ? 'roleAdmin' : 'roleEmployee')
                )}
              </td>
              <td className="px-4 py-3">
                <StatusBadge row={row} />
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {row.lastLoginAt ? format.date(new Date(row.lastLoginAt)) : '—'}
              </td>
              <td className="px-4 py-3 text-end">
                <Button variant="outline" size="sm" onClick={() => onSelect(row.id)}>
                  {t('manage')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function StatusBadge({ row }: { row: AdminUserRow }) {
  const t = useTranslations('admin');

  if (row.status === 'SUSPENDED') {
    return <Badge variant="navy">{t('statusSuspended')}</Badge>;
  }

  /*
   * "Invited" is a third state the database does not have a column for, and it
   * is the one an administrator most often needs: an account that was created
   * but never activated looks identical to a working one on `status` alone, and
   * "why can this person not sign in" is the question this screen answers.
   */
  if (!row.emailVerifiedAt) {
    return <Badge variant="gold">{t('statusInvited')}</Badge>;
  }

  return <Badge variant="soft">{t('statusActive')}</Badge>;
}

function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const t = useTranslations('admin');
  const format = useFormat();
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  if (lastPage === 1) {
    /* One page needs no controls — §3's rule against showing what cannot act. */
    return (
      <p className="text-sm text-muted-foreground">
        {t('resultCount', { count: format.number(total) })}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        {t('resultCount', { count: format.number(total) })}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          {t('previousPage')}
        </Button>
        <span className="text-sm text-muted-foreground">{format.fraction(page, lastPage)}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= lastPage}
          onClick={() => onChange(page + 1)}
        >
          {t('nextPage')}
        </Button>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? /* Weight as well as the gold edge, so position is not signalled by
               colour alone (WCAG 1.4.1). */
            'border-b-2 border-gold px-4 py-2 text-sm font-semibold text-foreground'
          : 'border-b-2 border-transparent px-4 py-2 text-sm text-muted-foreground hover:text-foreground'
      }
    >
      {children}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="px-4 py-3 text-start font-medium">
      {children}
    </th>
  );
}
