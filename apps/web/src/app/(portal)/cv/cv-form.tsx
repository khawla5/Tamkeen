'use client';

import { Award, Lock, Medal, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ComponentProps } from 'react';

import {
  CV_MAX_EDUCATION,
  CV_MAX_EXPERIENCE,
  CV_MAX_EXTERNAL_CERTIFICATIONS,
  CV_MAX_SKILLS,
  type CvAutofill,
  type CvEducationEntry,
  type CvExperienceEntry,
  type CvExternalCertification,
  type CvProfile,
} from '@tamkeen/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useFormat } from '@/i18n/format-provider';
import { Badge } from '@/components/ui/badge';
import { EntryActions, moveItem } from './entry-actions';

/**
 * The CV form (§4.11, D-050).
 *
 * **Arabic chrome, English content.** Every label, hint and button here is
 * Arabic like the rest of the product; what the learner types into the fields
 * is English, because the CV is an English document. That split is the reason
 * the inputs carry `dir="auto"` rather than a fixed direction — a field
 * pre-filled with an Arabic department and a field holding an English job title
 * are both normal, and letting the browser decide per value is the only thing
 * that gets both right.
 */

export interface CvFormProps {
  profile: CvProfile;
  autofill: CvAutofill;
  onChange: (profile: CvProfile) => void;
}

/** Inputs default to `dir="auto"`; see the file comment. */
function AutoInput(props: ComponentProps<'input'>) {
  return <Input dir="auto" {...props} />;
}

function newId(): string {
  return crypto.randomUUID();
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function CvForm({ profile, autofill, onChange }: CvFormProps) {
  const t = useTranslations('cv');
  const format = useFormat();

  const set = <K extends keyof CvProfile>(key: K, value: CvProfile[K]) =>
    onChange({ ...profile, [key]: value });

  return (
    <div className="flex flex-col gap-8">
      <Section title={t('personalSection')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="cv-full-name" label={t('fullName')}>
            {(field) => (
              <AutoInput
                {...field}
                value={profile.fullName}
                onChange={(event) => set('fullName', event.target.value)}
              />
            )}
          </Field>

          <Field id="cv-job-title" label={t('jobTitle')}>
            {(field) => (
              <AutoInput
                {...field}
                value={profile.jobTitle}
                onChange={(event) => set('jobTitle', event.target.value)}
              />
            )}
          </Field>

          <Field id="cv-department" label={t('department')}>
            {(field) => (
              <AutoInput
                {...field}
                value={profile.department}
                onChange={(event) => set('department', event.target.value)}
              />
            )}
          </Field>

          <Field id="cv-email" label={t('email')} hint={t('optional')}>
            {(field) => (
              <AutoInput
                {...field}
                type="email"
                value={profile.email}
                onChange={(event) => set('email', event.target.value)}
              />
            )}
          </Field>

          <Field id="cv-phone" label={t('phone')} hint={t('optional')}>
            {(field) => (
              <AutoInput
                {...field}
                value={profile.phone}
                onChange={(event) => set('phone', event.target.value)}
              />
            )}
          </Field>
        </div>

        <Field id="cv-summary" label={t('summary')} hint={t('optional')}>
          {(field) => (
            <Textarea
              {...field}
              dir="auto"
              value={profile.summary}
              onChange={(event) => set('summary', event.target.value)}
            />
          )}
        </Field>
      </Section>

      <Section title={t('careerSection')}>
        {autofill.careerProfile ? (
          <label className="flex items-center gap-3 text-sm text-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary-600"
              checked={profile.showCareerProfile}
              onChange={(event) => set('showCareerProfile', event.target.checked)}
            />
            {t('careerToggle')}
          </label>
        ) : (
          <p className="text-sm text-muted-foreground">{t('careerNone')}</p>
        )}
      </Section>

      <ExperienceSection
        entries={profile.experience}
        onChange={(entries) => set('experience', entries)}
      />

      <EducationSection
        entries={profile.education}
        onChange={(entries) => set('education', entries)}
      />

      <Section title={t('skillsSection')}>
        <SkillsEditor skills={profile.skills} onChange={(skills) => set('skills', skills)} />
      </Section>

      <Section title={t('certificationsSection')}>
        {/*
          Platform certificates are shown but not editable — §4.11 is explicit
          that the learner "cannot edit or delete the platform-issued ones".
          They are the part of this CV that is not self-reported, and the API
          would reject them in a request body anyway; showing them locked makes
          that visible rather than a surprise.
        */}
        <div className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Lock aria-hidden="true" className="size-3.5 text-muted-foreground" />
            {t('platformCertifications')}
          </h3>
          <p className="text-xs text-muted-foreground">{t('platformNote')}</p>

          {autofill.certifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('platformEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {autofill.certifications.map((certificate) => {
                const Icon = certificate.type === 'PATH' ? Medal : Award;

                return (
                  <li key={certificate.certificateId}>
                    <Card>
                      <CardContent className="flex items-start gap-3 py-3">
                        <Icon
                          aria-hidden="true"
                          className={
                            certificate.type === 'PATH'
                              ? 'mt-0.5 size-4 text-primary-700'
                              : 'mt-0.5 size-4 text-muted-foreground'
                          }
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{certificate.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {certificate.type === 'PATH' ? t('typePath') : t('typeCourse')} ·{' '}
                            {format.date(new Date(certificate.issuedAt))}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <ExternalCertificationsSection
          entries={profile.externalCertifications}
          onChange={(entries) => set('externalCertifications', entries)}
        />
      </Section>
    </div>
  );
}

/* ── Repeatable sections ──────────────────────────────────────────────────── */

function AddButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const t = useTranslations('cv');

  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onClick}>
        <Plus aria-hidden="true" />
        {label}
      </Button>
      {disabled ? <span className="text-xs text-muted-foreground">{t('limitReached')}</span> : null}
    </div>
  );
}

function ExperienceSection({
  entries,
  onChange,
}: {
  entries: CvExperienceEntry[];
  onChange: (entries: CvExperienceEntry[]) => void;
}) {
  const t = useTranslations('cv');

  const update = (index: number, patch: Partial<CvExperienceEntry>) =>
    onChange(entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));

  return (
    <Section title={t('experienceSection')}>
      {entries.map((entry, index) => (
        <Card key={entry.id}>
          <CardContent className="flex flex-col gap-4 pt-6">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-medium text-muted-foreground">
                {t('entryCount', { count: index + 1, max: CV_MAX_EXPERIENCE })}
              </span>
              <EntryActions
                name={entry.role}
                index={index}
                count={entries.length}
                onMove={(from, to) => onChange(moveItem(entries, from, to))}
                onRemove={(i) => onChange(entries.filter((_, position) => position !== i))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={`cv-exp-role-${entry.id}`} label={t('role')}>
                {(field) => (
                  <AutoInput
                    {...field}
                    value={entry.role}
                    onChange={(event) => update(index, { role: event.target.value })}
                  />
                )}
              </Field>

              <Field id={`cv-exp-org-${entry.id}`} label={t('organization')}>
                {(field) => (
                  <AutoInput
                    {...field}
                    value={entry.organization}
                    onChange={(event) => update(index, { organization: event.target.value })}
                  />
                )}
              </Field>

              <Field id={`cv-exp-start-${entry.id}`} label={t('startDate')}>
                {(field) => (
                  /* `month`, not a text field: the stored value is `YYYY-MM`
                     because `format.ts` renders it (D-018), and a free-text
                     date would be rejected by the API. */
                  <Input
                    {...field}
                    type="month"
                    value={entry.startDate}
                    onChange={(event) => update(index, { startDate: event.target.value })}
                  />
                )}
              </Field>

              <Field id={`cv-exp-end-${entry.id}`} label={t('endDate')}>
                {(field) => (
                  <Input
                    {...field}
                    type="month"
                    value={entry.endDate ?? ''}
                    disabled={entry.endDate === null}
                    onChange={(event) => update(index, { endDate: event.target.value })}
                  />
                )}
              </Field>
            </div>

            <label className="flex items-center gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                className="size-4 accent-primary-600"
                checked={entry.endDate === null}
                onChange={(event) =>
                  update(index, { endDate: event.target.checked ? null : '2026-01' })
                }
              />
              {t('current')}
            </label>

            <Field id={`cv-exp-desc-${entry.id}`} label={t('description')} hint={t('optional')}>
              {(field) => (
                <Textarea
                  {...field}
                  dir="auto"
                  rows={3}
                  value={entry.description}
                  onChange={(event) => update(index, { description: event.target.value })}
                />
              )}
            </Field>
          </CardContent>
        </Card>
      ))}

      <AddButton
        label={t('addExperience')}
        disabled={entries.length >= CV_MAX_EXPERIENCE}
        onClick={() =>
          onChange([
            ...entries,
            {
              id: newId(),
              role: '',
              organization: '',
              startDate: '2026-01',
              endDate: null,
              description: '',
            },
          ])
        }
      />
    </Section>
  );
}

function EducationSection({
  entries,
  onChange,
}: {
  entries: CvEducationEntry[];
  onChange: (entries: CvEducationEntry[]) => void;
}) {
  const t = useTranslations('cv');

  const update = (index: number, patch: Partial<CvEducationEntry>) =>
    onChange(entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));

  const toYear = (value: string): number | null => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return (
    <Section title={t('educationSection')}>
      {entries.map((entry, index) => (
        <Card key={entry.id}>
          <CardContent className="flex flex-col gap-4 pt-6">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-medium text-muted-foreground">
                {t('entryCount', { count: index + 1, max: CV_MAX_EDUCATION })}
              </span>
              <EntryActions
                name={entry.qualification}
                index={index}
                count={entries.length}
                onMove={(from, to) => onChange(moveItem(entries, from, to))}
                onRemove={(i) => onChange(entries.filter((_, position) => position !== i))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={`cv-edu-qual-${entry.id}`} label={t('qualification')}>
                {(field) => (
                  <AutoInput
                    {...field}
                    value={entry.qualification}
                    onChange={(event) => update(index, { qualification: event.target.value })}
                  />
                )}
              </Field>

              <Field id={`cv-edu-inst-${entry.id}`} label={t('institution')}>
                {(field) => (
                  <AutoInput
                    {...field}
                    value={entry.institution}
                    onChange={(event) => update(index, { institution: event.target.value })}
                  />
                )}
              </Field>

              <Field id={`cv-edu-start-${entry.id}`} label={t('startYear')}>
                {(field) => (
                  <Input
                    {...field}
                    type="number"
                    min={1900}
                    max={2100}
                    value={entry.startYear ?? ''}
                    onChange={(event) => update(index, { startYear: toYear(event.target.value) })}
                  />
                )}
              </Field>

              <Field id={`cv-edu-end-${entry.id}`} label={t('endYear')}>
                {(field) => (
                  <Input
                    {...field}
                    type="number"
                    min={1900}
                    max={2100}
                    value={entry.endYear ?? ''}
                    onChange={(event) => update(index, { endYear: toYear(event.target.value) })}
                  />
                )}
              </Field>
            </div>
          </CardContent>
        </Card>
      ))}

      <AddButton
        label={t('addEducation')}
        disabled={entries.length >= CV_MAX_EDUCATION}
        onClick={() =>
          onChange([
            ...entries,
            { id: newId(), qualification: '', institution: '', startYear: null, endYear: null },
          ])
        }
      />
    </Section>
  );
}

function ExternalCertificationsSection({
  entries,
  onChange,
}: {
  entries: CvExternalCertification[];
  onChange: (entries: CvExternalCertification[]) => void;
}) {
  const t = useTranslations('cv');

  const update = (index: number, patch: Partial<CvExternalCertification>) =>
    onChange(entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-medium text-foreground">{t('externalCertifications')}</h3>

      {entries.map((entry, index) => (
        <Card key={entry.id}>
          <CardContent className="flex flex-col gap-4 pt-6">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-medium text-muted-foreground">
                {t('entryCount', { count: index + 1, max: CV_MAX_EXTERNAL_CERTIFICATIONS })}
              </span>
              <EntryActions
                name={entry.title}
                index={index}
                count={entries.length}
                onMove={(from, to) => onChange(moveItem(entries, from, to))}
                onRemove={(i) => onChange(entries.filter((_, position) => position !== i))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={`cv-ext-title-${entry.id}`} label={t('certificateTitle')}>
                {(field) => (
                  <AutoInput
                    {...field}
                    value={entry.title}
                    onChange={(event) => update(index, { title: event.target.value })}
                  />
                )}
              </Field>

              <Field id={`cv-ext-issuer-${entry.id}`} label={t('issuer')}>
                {(field) => (
                  <AutoInput
                    {...field}
                    value={entry.issuer}
                    onChange={(event) => update(index, { issuer: event.target.value })}
                  />
                )}
              </Field>

              <Field id={`cv-ext-date-${entry.id}`} label={t('issuedOn')} hint={t('optional')}>
                {(field) => (
                  <Input
                    {...field}
                    type="month"
                    value={entry.issuedOn ?? ''}
                    onChange={(event) => update(index, { issuedOn: event.target.value || null })}
                  />
                )}
              </Field>
            </div>
          </CardContent>
        </Card>
      ))}

      <AddButton
        label={t('addExternal')}
        disabled={entries.length >= CV_MAX_EXTERNAL_CERTIFICATIONS}
        onClick={() =>
          onChange([...entries, { id: newId(), title: '', issuer: '', issuedOn: null }])
        }
      />
    </div>
  );
}

/**
 * Skills as tags (§4.11 — "a simple list/tags", no rating system for v1).
 *
 * Enter adds, and the form is not submitted by it: a stray Enter in a text
 * field on a long form would otherwise save the whole CV mid-edit.
 */
function SkillsEditor({
  skills,
  onChange,
}: {
  skills: string[];
  onChange: (skills: string[]) => void;
}) {
  const t = useTranslations('cv');
  const [draft, setDraft] = useState('');

  const add = () => {
    const value = draft.trim();
    /* Silently ignoring a duplicate is friendlier than an error for something
       the learner can see is already in the list. */
    if (value.length === 0 || skills.includes(value) || skills.length >= CV_MAX_SKILLS) {
      setDraft('');
      return;
    }

    onChange([...skills, value]);
    setDraft('');
  };

  return (
    <div className="flex flex-col gap-3">
      {skills.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <li key={skill}>
              <Badge variant="neutral" dir="auto" className="gap-1.5 text-sm font-medium">
                {skill}
                <button
                  type="button"
                  aria-label={t('removeEntry', { name: skill })}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => onChange(skills.filter((existing) => existing !== skill))}
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex gap-2">
        <Field id="cv-skill-draft" label={t('addSkill')}>
          {(field) => (
            <AutoInput
              {...field}
              value={draft}
              placeholder={t('skillPlaceholder')}
              disabled={skills.length >= CV_MAX_SKILLS}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  add();
                }
              }}
            />
          )}
        </Field>
      </div>
    </div>
  );
}
