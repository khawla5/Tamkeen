import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CvView } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * The CV builder (§4.11, D-050).
 *
 * Three things are actually under test. The **pre-fill**, because "the user
 * never retypes what the system knows" is the feature. The **repeatable
 * sections**, because add / remove / reorder is where a form like this breaks.
 * And the **preview**, because §4.11 asks for it to be live and it renders the
 * same function the PDF prints — so if it is wrong here it is wrong on paper.
 */

const api = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  cvApi: {
    get: api.get,
    save: api.save,
    exportUrl: () => 'http://api.test/api/cv/export',
  },
}));

vi.mock('@/components/layout/portal-page', () => ({
  PortalPage: ({
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

const { default: CvPage } = await import('@/app/(portal)/cv/page');

const VIEW: CvView = {
  profile: {
    fullName: 'عبدالله بن محمد الدماطي',
    jobTitle: '',
    department: 'إدارة الموارد البشرية',
    email: 'abdullah@ministry.gov.example',
    phone: '',
    summary: '',
    experience: [],
    education: [],
    skills: [],
    externalCertifications: [],
    showCareerProfile: true,
  },
  autofill: {
    accountFullName: 'عبدالله بن محمد الدماطي',
    accountDepartment: 'إدارة الموارد البشرية',
    accountEmail: 'abdullah@ministry.gov.example',
    certifications: [
      {
        certificateId: 'cert-path',
        type: 'PATH',
        title: 'مسار القيادة الإدارية',
        issuedAt: '2026-08-18T09:00:00.000Z',
      },
      {
        certificateId: 'cert-course',
        type: 'COURSE',
        title: 'أساسيات القيادة الإدارية',
        issuedAt: '2026-08-10T09:00:00.000Z',
      },
    ],
    careerProfile: {
      paths: [
        { name: 'مسار القيادة الإدارية', levelName: 'متقدم', completed: true },
        { name: 'مسار تحليل البيانات', levelName: null, completed: false },
      ],
    },
  },
  savedAt: null,
};

const preview = () => document.querySelector('.cv-document')!;

describe('CV builder', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.save.mockReset();
    api.get.mockResolvedValue(VIEW);
    api.save.mockImplementation((profile: CvView['profile']) =>
      Promise.resolve({ ...VIEW, profile, savedAt: '2026-08-20T10:00:00.000Z' }),
    );
  });

  it('shows a loading state first', () => {
    api.get.mockReturnValue(new Promise(() => undefined));

    renderWithProviders(<CvPage />);

    expect(screen.getByText('جارٍ التحميل…')).toBeInTheDocument();
  });

  it('shows an error with a retry when the CV cannot be loaded', async () => {
    api.get.mockRejectedValue(new Error('network down'));

    renderWithProviders(<CvPage />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument();
  });

  describe('pre-fill', () => {
    it('arrives with the name and department already filled in', async () => {
      renderWithProviders(<CvPage />);

      expect(await screen.findByLabelText('الاسم الكامل')).toHaveValue('عبدالله بن محمد الدماطي');
      expect(screen.getByLabelText('الإدارة')).toHaveValue('إدارة الموارد البشرية');
      expect(screen.getByLabelText('البريد الإلكتروني')).toHaveValue(
        'abdullah@ministry.gov.example',
      );
    });

    it('lists platform certificates as locked, with no way to edit them', async () => {
      /* §4.11: the learner "cannot edit or delete the platform-issued ones".
         They are the part of this CV that is not self-reported. */
      renderWithProviders(<CvPage />);

      await screen.findByText('شهادات المنصة');

      expect(screen.getByText('تُضاف تلقائياً من شهاداتك ولا يمكن تعديلها.')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'حذف مسار القيادة الإدارية' }),
      ).not.toBeInTheDocument();
    });

    it('offers the career line as a toggle, on by default', async () => {
      renderWithProviders(<CvPage />);

      expect(
        await screen.findByLabelText('إظهار مساراتي ومستوياتي في السيرة الذاتية'),
      ).toBeChecked();
    });

    it('says the section will appear once a path is assigned, rather than showing an empty toggle', async () => {
      api.get.mockResolvedValue({ ...VIEW, autofill: { ...VIEW.autofill, careerProfile: null } });
      renderWithProviders(<CvPage />);

      expect(await screen.findByText('لن يظهر هذا القسم قبل إسناد مسار إليك.')).toBeInTheDocument();
      expect(
        screen.queryByLabelText('إظهار مساراتي ومستوياتي في السيرة الذاتية'),
      ).not.toBeInTheDocument();
    });
  });

  describe('the live preview', () => {
    it('renders an English document with the Arabic name passed through', async () => {
      /* D-050 — proper nouns are not translated, and an Arabic name inside an
         English CV is expected and correct. */
      renderWithProviders(<CvPage />);
      await screen.findByLabelText('الاسم الكامل');

      const document_ = preview();

      expect(document_).toHaveTextContent('عبدالله بن محمد الدماطي');
      /* Uppercased by CSS, so the DOM text is title case. */
      expect(document_).toHaveTextContent('Certifications');
      expect(document_).toHaveTextContent('Profile');
    });

    it('lists the platform certificates without the learner typing them', async () => {
      renderWithProviders(<CvPage />);
      await screen.findByLabelText('الاسم الكامل');

      const document_ = preview();

      expect(document_).toHaveTextContent('مسار القيادة الإدارية');
      expect(document_).toHaveTextContent('Path certificate');
      expect(document_).toHaveTextContent('Course certificate');
      /* English dates, through format.ts (D-050). */
      expect(document_).toHaveTextContent('August 18, 2026');
    });

    it('names each assigned path and the rung the placement test put them on', async () => {
      /* D-134 replaced the Holland profile with the thing a CV reader can use:
         which paths the ministry put them on and where they were placed. Path
         and level names pass through in Arabic, untranslated (D-050). */
      renderWithProviders(<CvPage />);
      await screen.findByLabelText('الاسم الكامل');

      const document_ = preview();

      expect(document_).toHaveTextContent('Completed the مسار القيادة الإدارية career path');
      expect(document_).toHaveTextContent('at level متقدم');
    });

    it('says "enrolled on" rather than a level for a path whose assessment is untaken', async () => {
      /* Inventing a rung would be a claim on a CV that nothing supports. */
      renderWithProviders(<CvPage />);
      await screen.findByLabelText('الاسم الكامل');

      const document_ = preview();

      expect(document_).toHaveTextContent('Enrolled on the مسار تحليل البيانات career path');
      expect(document_).not.toHaveTextContent('مسار تحليل البيانات career path at level');
    });

    it('updates as the learner types', async () => {
      const user = userEvent.setup();
      renderWithProviders(<CvPage />);

      await user.type(await screen.findByLabelText('المسمّى الوظيفي'), 'Training Officer');

      await waitFor(() => {
        expect(preview()).toHaveTextContent('Training Officer');
      });
    });

    it('drops the career line when the learner switches it off', async () => {
      const user = userEvent.setup();
      renderWithProviders(<CvPage />);

      await user.click(await screen.findByLabelText('إظهار مساراتي ومستوياتي في السيرة الذاتية'));

      await waitFor(() => {
        expect(preview()).not.toHaveTextContent('career path');
      });
      /* Only the line goes — the certificates it sat beside stay. */
      expect(preview()).toHaveTextContent('Path certificate');
    });
  });

  describe('repeatable sections', () => {
    it('adds an experience entry with its own fields', async () => {
      const user = userEvent.setup();
      renderWithProviders(<CvPage />);

      await screen.findByLabelText('الاسم الكامل');
      expect(screen.queryByLabelText('جهة العمل')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'أضف خبرة' }));

      expect(screen.getByLabelText('الدور الوظيفي')).toBeInTheDocument();
      expect(screen.getByLabelText('جهة العمل')).toBeInTheDocument();
      /* A new role is current by default — the common case, and §4.11 names
         "current" as a state rather than an empty end date. */
      expect(screen.getByLabelText('ما زلت أعمل هنا')).toBeChecked();
    });

    it('labels the entry role distinctly from the header job title', async () => {
      /* Two identically-labelled fields in one form are ambiguous to a screen
         reader; the section heading is not part of the accessible name. */
      const user = userEvent.setup();
      renderWithProviders(<CvPage />);

      await screen.findByLabelText('الاسم الكامل');
      await user.click(screen.getByRole('button', { name: 'أضف خبرة' }));

      expect(screen.getAllByLabelText('المسمّى الوظيفي')).toHaveLength(1);
      expect(screen.getAllByLabelText('الدور الوظيفي')).toHaveLength(1);
    });

    it('removes an entry', async () => {
      const user = userEvent.setup();
      renderWithProviders(<CvPage />);

      await user.click(await screen.findByRole('button', { name: 'أضف مؤهلاً' }));
      expect(screen.getByLabelText('المؤهل')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /حذف/ }));

      expect(screen.queryByLabelText('المؤهل')).not.toBeInTheDocument();
    });

    it('reorders entries with buttons rather than dragging (WCAG 2.1 AA)', async () => {
      const user = userEvent.setup();
      renderWithProviders(<CvPage />);

      await user.click(await screen.findByRole('button', { name: 'أضف مؤهلاً' }));
      await user.click(screen.getByRole('button', { name: 'أضف مؤهلاً' }));

      const qualifications = screen.getAllByLabelText('المؤهل');
      await user.type(qualifications[0]!, 'First');
      await user.type(screen.getAllByLabelText('المؤهل')[1]!, 'Second');

      await user.click(screen.getByRole('button', { name: /تحريك لأعلى — Second/ }));

      const reordered = screen.getAllByLabelText('المؤهل');
      expect(reordered[0]).toHaveValue('Second');
      expect(reordered[1]).toHaveValue('First');
    });

    it('adds a skill on Enter without submitting the form', async () => {
      const user = userEvent.setup();
      renderWithProviders(<CvPage />);

      const input = await screen.findByLabelText('أضف مهارة');
      await user.type(input, 'Curriculum design{Enter}');

      /* Queried by the tag's remove button rather than its text: the preview
         renders the same words, and it is aria-hidden so roles skip it. */
      expect(screen.getByRole('button', { name: 'حذف Curriculum design' })).toBeInTheDocument();
      expect(input).toHaveValue('');
      expect(api.save).not.toHaveBeenCalled();
    });

    it('ignores a duplicate skill rather than erroring', async () => {
      const user = userEvent.setup();
      renderWithProviders(<CvPage />);

      const input = await screen.findByLabelText('أضف مهارة');
      await user.type(input, 'Moodle{Enter}');
      await user.type(input, 'Moodle{Enter}');

      expect(screen.getAllByRole('button', { name: 'حذف Moodle' })).toHaveLength(1);
    });
  });

  describe('saving', () => {
    it('is disabled until something changes (§4.11 — one save)', async () => {
      const user = userEvent.setup();
      renderWithProviders(<CvPage />);

      /* The save button lives in the page header and renders before the form
         loads, so wait for a field rather than for the button. */
      const jobTitle = await screen.findByLabelText('المسمّى الوظيفي');
      expect(screen.getByRole('button', { name: 'حفظ' })).toBeDisabled();

      await user.type(jobTitle, 'Officer');

      expect(screen.getByRole('button', { name: 'حفظ' })).toBeEnabled();
    });

    it('sends what the learner authored and nothing the system supplied', async () => {
      /* The certifications are read from the certificates table; posting them
         would be rejected, and sending them at all would be a bug worth
         catching here rather than at the API. */
      const user = userEvent.setup();
      renderWithProviders(<CvPage />);

      await user.type(await screen.findByLabelText('المسمّى الوظيفي'), 'Officer');
      await user.click(screen.getByRole('button', { name: 'حفظ' }));

      await waitFor(() => {
        expect(api.save).toHaveBeenCalledTimes(1);
      });

      const sent = api.save.mock.calls[0]![0] as Record<string, unknown>;

      expect(sent.jobTitle).toBe('Officer');
      expect(sent).not.toHaveProperty('certifications');
      expect(sent).not.toHaveProperty('careerProfile');
      expect(sent).not.toHaveProperty('accountFullName');
    });

    it('confirms the save and settles back to disabled', async () => {
      const user = userEvent.setup();
      renderWithProviders(<CvPage />);

      await user.type(await screen.findByLabelText('المسمّى الوظيفي'), 'Officer');
      await user.click(screen.getByRole('button', { name: 'حفظ' }));

      expect(await screen.findByText('تم الحفظ')).toBeInTheDocument();
    });

    it('reports a failed save without losing the document', async () => {
      const user = userEvent.setup();
      api.save.mockResolvedValue(undefined);
      renderWithProviders(<CvPage />);

      await user.type(await screen.findByLabelText('المسمّى الوظيفي'), 'Officer');
      await user.click(screen.getByRole('button', { name: 'حفظ' }));

      /* Whatever happened, the learner's typing is still on screen. */
      await waitFor(() => {
        expect(screen.getByLabelText('المسمّى الوظيفي')).toHaveValue('Officer');
      });
    });
  });

  it('says plainly that the document is written in English (D-050)', async () => {
    /* Arabic labels over English fields is otherwise a guess. */
    renderWithProviders(<CvPage />);

    expect(
      await screen.findByText(
        'تُكتب السيرة الذاتية بالإنجليزية. أما الأسماء وعناوين الشهادات والمسارات فتظهر كما هي دون ترجمة.',
      ),
    ).toBeInTheDocument();
  });
  describe('the PDF export (§4.11)', () => {
    it('is unavailable until the CV has been saved once', async () => {
      /* There is nothing on the server to render yet. */
      renderWithProviders(<CvPage />);

      await screen.findByLabelText('الاسم الكامل');

      expect(screen.queryByRole('link', { name: /تصدير/ })).not.toBeInTheDocument();
    });

    it('becomes a real download link once saved', async () => {
      const user = userEvent.setup();
      renderWithProviders(<CvPage />);

      await user.type(await screen.findByLabelText('المسمّى الوظيفي'), 'Officer');
      await user.click(screen.getByRole('button', { name: 'حفظ' }));

      const link = await screen.findByRole('link', { name: /تصدير/ });
      expect(link).toHaveAttribute('href', 'http://api.test/api/cv/export');
    });

    it('goes away again while there are unsaved edits', async () => {
      /*
       * The export renders the *saved* document. A file that quietly differed
       * from the preview it was exported from would be worse than one the
       * learner has to press save for.
       */
      const user = userEvent.setup();
      renderWithProviders(<CvPage />);

      await user.type(await screen.findByLabelText('المسمّى الوظيفي'), 'Officer');
      await user.click(screen.getByRole('button', { name: 'حفظ' }));
      await screen.findByRole('link', { name: /تصدير/ });

      await user.type(screen.getByLabelText('نبذة مهنية'), 'More');

      await waitFor(() => {
        expect(screen.queryByRole('link', { name: /تصدير/ })).not.toBeInTheDocument();
      });
      /* And it says why rather than leaving a greyed-out button to interpret. */
      expect(screen.getByTitle('احفظ التغييرات قبل التصدير.')).toBeInTheDocument();
    });
  });
});
