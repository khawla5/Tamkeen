import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminUserDetail, AdminUserPage, AdminUserRow } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4C.2 — user and organisation management.
 *
 * Two things carry most of the weight here. First, **"invited" is a state the
 * database has no column for**: an account created but never activated looks
 * identical to a working one on `status` alone, and "why can this person not
 * sign in" is the question this screen exists to answer. Second, **no password
 * appears anywhere in the provisioning flow** — the form does not ask for one
 * and the confirmation does not show one.
 */

const api = vi.hoisted(() => ({
  listUsers: vi.fn(),
  getUser: vi.fn(),
  listPaths: vi.fn(),
  assignPath: vi.fn(),
  revokePath: vi.fn(),
  createUser: vi.fn(),
  reinvite: vi.fn(),
  setUserStatus: vi.fn(),
  setUserRole: vi.fn(),
  listEntities: vi.fn(),
  createEntity: vi.fn(),
  updateEntity: vi.fn(),
}));

vi.mock('@/lib/api-client', async () => {
  /* The real ApiError is kept: mocking the module wholesale would drop it, and
     `useErrorMessage` would then translate every failure as UNKNOWN_ERROR while
     the test still looked like it exercised the error path. */
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');

  return { ...actual, adminApi: api };
});

vi.mock('@/components/layout/admin-page', () => ({
  AdminPage: ({
    title,
    action,
    children,
  }: {
    title: string;
    action?: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      {action}
      {children}
    </div>
  ),
}));

const { default: AdminUsersPage } = await import('@/app/(admin)/admin/users/page');

function row(overrides: Partial<AdminUserRow> = {}): AdminUserRow {
  return {
    id: 'u1',
    email: 'sara@ministry.gov.example',
    fullName: 'سارة العتيبي',
    employeeId: 'EMP-1001',
    department: 'تقنية المعلومات',
    role: 'EMPLOYEE',
    status: 'ACTIVE',
    emailVerifiedAt: '2026-08-01T00:00:00.000Z',
    lastLoginAt: '2026-08-20T00:00:00.000Z',
    entity: null,
    ...overrides,
  };
}

function page(rows: AdminUserRow[], total = rows.length): AdminUserPage {
  return { rows, total, page: 1, pageSize: 25 };
}

/**
 * Scopes a query to the open modal.
 *
 * The filter bar and the create form deliberately share labels — both ask for a
 * role — so an unscoped `getByLabelText` is ambiguous. That ambiguity is a
 * property of the screen rather than a defect: the two controls mean the same
 * thing in different places, and renaming one to disambiguate a test would make
 * the Arabic worse.
 */
function dialog() {
  return within(document.querySelector('dialog')!);
}

/** Scopes a query to the results table, away from the filter dropdowns. */
function table() {
  return within(screen.getByRole('table'));
}

const DETAIL: AdminUserDetail = {
  ...row(),
  createdAt: '2026-07-01T00:00:00.000Z',
  hasLmsAccount: true,
  assessments: [],
  certificateCount: 2,
  activeSessions: 1,
  /* D-133/D-134: one path placed, one still awaiting the assessment — the panel
     shows both states at once, and only the second may be revoked. */
  paths: [
    {
      userPathId: 'up-1',
      pathId: 'p-1',
      name: 'مسار الموارد البشرية',
      status: 'ACTIVE',
      assignedAt: '2026-08-06T00:00:00.000Z',
      placedLevel: { id: 'l-2', name: 'متقدم', position: 2 },
      coursesPassed: 2,
      coursesTotal: 6,
    },
    {
      userPathId: 'up-2',
      pathId: 'p-2',
      name: 'مسار تحليل البيانات',
      status: 'ACTIVE',
      assignedAt: '2026-08-07T00:00:00.000Z',
      placedLevel: null,
      coursesPassed: 0,
      coursesTotal: 4,
    },
  ],
};

/** The published paths the assign control offers. */
const PATH_ROWS = [
  {
    id: 'p-1',
    key: 'hr',
    name: 'مسار الموارد البشرية',
    levelCount: 3,
    placedCourseCount: 6,
    unassignedCourseCount: 0,
    assignedLearners: 1,
    status: 'PUBLISHED' as const,
    displayOrder: 1,
  },
  {
    id: 'p-2',
    key: 'data',
    name: 'مسار تحليل البيانات',
    levelCount: 3,
    placedCourseCount: 4,
    unassignedCourseCount: 0,
    assignedLearners: 1,
    status: 'PUBLISHED' as const,
    displayOrder: 2,
  },
  {
    id: 'p-3',
    key: 'ops',
    name: 'مسار العمليات',
    levelCount: 3,
    placedCourseCount: 5,
    unassignedCourseCount: 0,
    assignedLearners: 0,
    status: 'PUBLISHED' as const,
    displayOrder: 3,
  },
  {
    /* A draft: never offered, because assigning to it would strand the learner
       (the server refuses it too). */
    id: 'p-4',
    key: 'draft',
    name: 'مسار قيد الإعداد',
    levelCount: 1,
    placedCourseCount: 0,
    unassignedCourseCount: 2,
    assignedLearners: 0,
    status: 'DRAFT' as const,
    displayOrder: 4,
  },
];

describe('Admin users (§4C.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listUsers.mockResolvedValue(page([row()]));
    api.listEntities.mockResolvedValue([]);
    api.listPaths.mockResolvedValue(PATH_ROWS);
    api.getUser.mockResolvedValue(DETAIL);
  });

  it('shows the loading state before the list arrives', () => {
    api.listUsers.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<AdminUsersPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('offers a retry when the list fails', async () => {
    api.listUsers.mockRejectedValue(new Error('down'));
    renderWithProviders(<AdminUsersPage />);

    expect(await screen.findByRole('button', { name: /إعادة/ })).toBeInTheDocument();
  });

  it('explains an empty result rather than showing a bare table', async () => {
    api.listUsers.mockResolvedValue(page([]));
    renderWithProviders(<AdminUsersPage />);

    expect(await screen.findByText('لا توجد حسابات مطابقة')).toBeInTheDocument();
  });

  it('renders the address left-to-right inside the RTL page', async () => {
    renderWithProviders(<AdminUsersPage />);

    const email = await screen.findByText('sara@ministry.gov.example');
    expect(email).toHaveAttribute('dir', 'ltr');
  });

  it('distinguishes an invited account from an active one', async () => {
    /* The database has one column for both. An administrator asked why somebody
       cannot sign in needs the difference on the screen. */
    api.listUsers.mockResolvedValue(page([row({ emailVerifiedAt: null })]));
    renderWithProviders(<AdminUsersPage />);

    expect(await screen.findByText('بانتظار التفعيل')).toBeInTheDocument();
    /* Scoped to the table: "نشط" is also a filter option, and finding it there
       would say nothing about the row. */
    expect(table().queryByText('نشط')).not.toBeInTheDocument();
  });

  it('marks a suspended account as suspended, not as invited', async () => {
    api.listUsers.mockResolvedValue(page([row({ status: 'SUSPENDED', emailVerifiedAt: null })]));
    renderWithProviders(<AdminUsersPage />);

    /* Suspension outranks the invitation state: an account that was cut off is
       not waiting for anything. */
    expect(await screen.findByText('موقوف')).toBeInTheDocument();
  });

  it('names the organisation on an entity account', async () => {
    api.listUsers.mockResolvedValue(
      page([row({ role: 'ENTITY', entity: { id: 'e1', name: 'معهد الإدارة' } })]),
    );
    renderWithProviders(<AdminUsersPage />);

    expect(await screen.findByText('معهد الإدارة')).toBeInTheDocument();
  });

  it('hides pagination when everything fits on one page', async () => {
    renderWithProviders(<AdminUsersPage />);

    await screen.findByText('سارة العتيبي');
    /* §3: a control that cannot act should not be on the screen. */
    expect(screen.queryByRole('button', { name: 'التالي' })).not.toBeInTheDocument();
  });

  it('pages when there is more than one page of results', async () => {
    api.listUsers.mockResolvedValue(page([row()], 80));
    renderWithProviders(<AdminUsersPage />);

    expect(await screen.findByRole('button', { name: 'التالي' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'السابق' })).toBeDisabled();
  });

  describe('provisioning', () => {
    it('asks for no password and shows none', async () => {
      const user = userEvent.setup();
      api.createUser.mockResolvedValue({
        user: row({ emailVerifiedAt: null }),
        invitationSentTo: 'new@authority.example',
        invitationExpiresAt: '2026-08-23T13:00:00.000Z',
      });

      renderWithProviders(<AdminUsersPage />);
      await user.click(await screen.findByRole('button', { name: 'إنشاء حساب' }));

      /* The form has no password field at all — not a disabled one, not a
         generated one on display. */
      expect(screen.queryByLabelText(/كلمة المرور/)).not.toBeInTheDocument();

      await user.type(dialog().getByLabelText('البريد الإلكتروني'), 'new@authority.example');
      await user.type(dialog().getByLabelText('الاسم'), 'منسّق');
      await user.type(dialog().getByLabelText('الرقم الوظيفي'), 'ENT-9');
      await user.type(dialog().getByLabelText('الإدارة'), 'التدريب');
      await user.click(dialog().getByRole('button', { name: 'إرسال الدعوة' }));

      expect(await screen.findByText('أُرسلت الدعوة')).toBeInTheDocument();
      expect(screen.getByText('new@authority.example')).toBeInTheDocument();
      /* The confirmation explains that the account is not usable yet, rather
         than implying it is ready. */
      expect(screen.getByText(/حتى يفتح صاحبه الرابط/)).toBeInTheDocument();
    });

    it('asks for an organisation only when the role needs one', async () => {
      const user = userEvent.setup();
      api.listEntities.mockResolvedValue([{ id: 'e1', name: 'معهد الإدارة' }]);

      renderWithProviders(<AdminUsersPage />);
      await user.click(await screen.findByRole('button', { name: 'إنشاء حساب' }));

      /* A control that can never apply to the chosen role should not be on the
         screen, greyed out or otherwise (§3). */
      expect(dialog().queryByLabelText('الجهة')).not.toBeInTheDocument();

      await user.selectOptions(dialog().getByLabelText('الدور'), 'ENTITY');

      await waitFor(() => expect(dialog().getByLabelText('الجهة')).toBeInTheDocument());
    });

    it('says so when no organisation exists to attach an account to', async () => {
      const user = userEvent.setup();
      api.listEntities.mockResolvedValue([]);

      renderWithProviders(<AdminUsersPage />);
      await user.click(await screen.findByRole('button', { name: 'إنشاء حساب' }));
      await user.selectOptions(dialog().getByLabelText('الدور'), 'ENTITY');

      /* Otherwise the administrator meets an empty dropdown and has to guess
         that the organisation is created on the other tab. */
      expect(await screen.findByText(/أنشئ الجهة أولًا/)).toBeInTheDocument();
    });
  });

  describe('managing one account', () => {
    it('summarises the journey without reproducing the learner screens', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminUsersPage />);

      await user.click(await screen.findByRole('button', { name: 'إدارة' }));

      /* The rung they were placed on, not the assessment answers behind it. */
      expect(await screen.findByText('متقدم')).toBeInTheDocument();
      expect(screen.getAllByText('مسار الموارد البشرية').length).toBeGreaterThan(0);
      /* A count, not the certificates themselves. */
      expect(screen.getByText('الشهادات')).toBeInTheDocument();
    });

    it('assignments (D-134): lists each path, and revokes only one nobody was placed in', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminUsersPage />);
      await user.click(await screen.findByRole('button', { name: 'إدارة' }));
      await screen.findByText('المسارات المُسندة');

      /* One placed, one awaiting (the fixture) — one revoke, not two: a
         placement is a record, and revoking under it would leave it pointing at
         a path the employee was never on. */
      expect(screen.getAllByText('مسار الموارد البشرية').length).toBeGreaterThan(0);
      expect(screen.getAllByRole('button', { name: 'إلغاء الإسناد' })).toHaveLength(1);
    });

    it('assignments (D-134): offers only published paths they are not on, one grant per tick', async () => {
      api.getUser.mockResolvedValue({ ...DETAIL, paths: [] });
      api.assignPath.mockResolvedValue({ created: 1, alreadyAssigned: 0 });
      const user = userEvent.setup();
      renderWithProviders(<AdminUsersPage />);
      await user.click(await screen.findByRole('button', { name: 'إدارة' }));

      const group = await screen.findByRole('group', { name: 'إسناد مسارات' });
      const boxes = within(group).getAllByRole('checkbox');
      /* Three published, never the draft. */
      expect(boxes).toHaveLength(3);

      /* Nothing ticked, nothing to send. */
      const assign = within(group).getByRole('button', { name: 'إسناد' });
      expect(assign).toBeDisabled();

      await user.click(within(group).getByLabelText('مسار الموارد البشرية'));
      await user.click(within(group).getByLabelText('مسار العمليات'));
      await user.click(assign);

      /* One decision per path on the wire — each grant its own event. */
      await waitFor(() => expect(api.assignPath).toHaveBeenCalledTimes(2));
      expect(api.assignPath).toHaveBeenCalledWith('p-1', ['u1']);
      expect(api.assignPath).toHaveBeenCalledWith('p-3', ['u1']);
      expect(await screen.findByText('أُسند المسار.')).toBeInTheDocument();
    });

    it('assignments (D-134): a path they already hold is not offered again', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminUsersPage />);
      await user.click(await screen.findByRole('button', { name: 'إدارة' }));

      const group = await screen.findByRole('group', { name: 'إسناد مسارات' });
      /* Two of the three published paths are already theirs. */
      expect(within(group).getAllByRole('checkbox')).toHaveLength(1);
      expect(within(group).getByLabelText('مسار العمليات')).toBeInTheDocument();
    });

    it('offers suspend for an active account and reactivate for a suspended one', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminUsersPage />);
      await user.click(await screen.findByRole('button', { name: 'إدارة' }));

      /* Context-dependent, never both (§3). */
      expect(await screen.findByRole('button', { name: 'إيقاف الحساب' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'إعادة تفعيل الحساب' })).not.toBeInTheDocument();
    });

    it('offers re-invitation only for an account that was never activated', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminUsersPage />);
      await user.click(await screen.findByRole('button', { name: 'إدارة' }));
      await screen.findByText('المسارات المُسندة');

      /* An "invitation" to somebody who already signed in is a password reset,
         and the server refuses it as such. */
      expect(screen.queryByRole('button', { name: 'إعادة إرسال الدعوة' })).not.toBeInTheDocument();
    });

    it('shows the server’s refusal rather than pre-empting it', async () => {
      const user = userEvent.setup();
      const { ApiError } = await import('@/lib/api-client');
      api.setUserStatus.mockRejectedValue(new ApiError('LAST_ACTIVE_ADMIN', 409));

      renderWithProviders(<AdminUsersPage />);
      await user.click(await screen.findByRole('button', { name: 'إدارة' }));
      await user.click(await screen.findByRole('button', { name: 'إيقاف الحساب' }));

      /* The rule is the server's; the screen explains the refusal in Arabic
         rather than hiding a button and teaching nothing. */
      expect(await screen.findByRole('alert')).toHaveTextContent(/آخر حساب مسؤول نشط/);
    });

    it('confirms a suspension once it succeeds', async () => {
      const user = userEvent.setup();
      api.setUserStatus.mockResolvedValue(row({ status: 'SUSPENDED' }));

      renderWithProviders(<AdminUsersPage />);
      await user.click(await screen.findByRole('button', { name: 'إدارة' }));
      await user.click(await screen.findByRole('button', { name: 'إيقاف الحساب' }));

      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/أُوقف الحساب/));
    });
  });

  describe('organisations', () => {
    it('stays out of the way until the administrator filters to entity accounts', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminUsersPage />);

      await screen.findByRole('table');
      /* No tab bar any more: the organisations are not a mode to switch into,
         they are context for a filter the administrator has already applied. */
      expect(screen.queryByRole('button', { name: 'الجهات' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'إضافة جهة' })).not.toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText('الدور'), 'ENTITY');

      expect(await screen.findByRole('heading', { name: 'الجهات' })).toBeInTheDocument();
    });

    it('explains the empty state by naming what to do first', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminUsersPage />);

      await screen.findByRole('table');
      await user.selectOptions(screen.getByLabelText('الدور'), 'ENTITY');

      expect(await screen.findByText('لا توجد جهات بعد')).toBeInTheDocument();
    });

    it('shows both counts, so a shell nobody staffed is visible', async () => {
      const user = userEvent.setup();
      api.listEntities.mockResolvedValue([
        {
          id: 'e1',
          key: 'inst',
          name: 'معهد الإدارة',
          contactName: '',
          contactEmail: '',
          status: 'ACTIVE',
          accountCount: 0,
          courseCount: 0,
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ]);

      renderWithProviders(<AdminUsersPage />);
      await screen.findByRole('table');
      await user.selectOptions(screen.getByLabelText('الدور'), 'ENTITY');

      expect(await screen.findByText('معهد الإدارة')).toBeInTheDocument();
      expect(screen.getByText('0 حساب · 0 دورة')).toBeInTheDocument();
    });
  });
});
