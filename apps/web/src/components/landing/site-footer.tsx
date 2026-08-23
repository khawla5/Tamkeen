import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Logo } from '@/components/brand/logo';
import { MinistryEmblem } from '@/components/brand/ministry-emblem';

/**
 * The government footer, in three blocks: who owns the platform, where to go,
 * and which policies govern it. Quick links point only at destinations that
 * exist; the policy names are plain text until their pages are written —
 * a link to nowhere is worse than no link (the same rule the portal nav keeps).
 */
const POLICY_KEYS = [
  'footerPolicyPrivacy',
  'footerPolicyTerms',
  'footerPolicyAccessibility',
] as const;

export function SiteFooter() {
  const t = useTranslations('landing');
  const tApp = useTranslations('app');

  return (
    <footer className="border-t border-border bg-neutral-50">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col items-start gap-4">
          <div className="flex items-center gap-6">
            <MinistryEmblem height={96} />
            <span aria-hidden="true" className="h-16 w-px bg-border" />
            <Logo height={72} />
          </div>
          <div className="text-sm leading-relaxed text-neutral-700">
            <p className="font-semibold text-foreground">{tApp('ministry')}</p>
            <p>{t('footerDirectorate')}</p>
            <p className="mt-2 text-muted-foreground">{t('footerAbout')}</p>
          </div>
        </div>

        <nav aria-label={t('footerLinksTitle')} className="text-sm">
          <p className="font-semibold text-foreground">{t('footerLinksTitle')}</p>
          <ul className="mt-3 flex flex-col gap-2">
            <li>
              <a href="#about" className="text-neutral-700 hover:text-primary-700 hover:underline">
                {t('footerLinkAbout')}
              </a>
            </li>
            <li>
              <Link
                href="/register"
                className="text-neutral-700 hover:text-primary-700 hover:underline"
              >
                {t('footerLinkRegister')}
              </Link>
            </li>
            <li>
              <Link
                href="/login"
                className="text-neutral-700 hover:text-primary-700 hover:underline"
              >
                {t('footerLinkSignIn')}
              </Link>
            </li>
          </ul>
        </nav>

        <div className="text-sm">
          <p className="font-semibold text-foreground">{t('footerPoliciesTitle')}</p>
          <ul className="mt-3 flex flex-col gap-2 text-muted-foreground">
            {POLICY_KEYS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>{t('footerOwner')}</span>
          <span>{t('footerClassification')}</span>
        </div>
      </div>
    </footer>
  );
}
