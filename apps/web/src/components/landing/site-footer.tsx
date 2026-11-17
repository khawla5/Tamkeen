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
    /* The hero's deep-green ground (user direction, replacing the light
       neutral): light text throughout, and the brand lockup on a white plate —
       the logo is dark blue on transparent and unreadable on the green. */
    <footer className="bg-primary-deep text-primary-50">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col items-start gap-4">
          <div className="inline-flex items-center gap-6 rounded-2xl bg-surface px-5 py-4">
            <MinistryEmblem height={96} />
            <span aria-hidden="true" className="h-16 w-px bg-border" />
            <Logo height={72} />
          </div>
          <div className="text-sm leading-relaxed">
            <p className="font-semibold text-surface">{tApp('ministry')}</p>
            <p className="mt-2 text-primary-100">{t('footerAbout')}</p>
          </div>
        </div>

        <nav aria-label={t('footerLinksTitle')} className="text-sm">
          <p className="font-semibold text-surface">{t('footerLinksTitle')}</p>
          <ul className="mt-3 flex flex-col gap-2">
            <li>
              <a href="#about" className="hover:text-surface hover:underline">
                {t('footerLinkAbout')}
              </a>
            </li>
            <li>
              <Link href="/register" className="hover:text-surface hover:underline">
                {t('footerLinkRegister')}
              </Link>
            </li>
            <li>
              <Link href="/login" className="hover:text-surface hover:underline">
                {t('footerLinkSignIn')}
              </Link>
            </li>
          </ul>
        </nav>

        <div className="text-sm">
          <p className="font-semibold text-surface">{t('footerPoliciesTitle')}</p>
          <ul className="mt-3 flex flex-col gap-2 text-primary-100">
            {POLICY_KEYS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-surface/20">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 text-xs text-primary-100 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>{t('footerOwner')}</span>
          <span>{t('footerClassification')}</span>
        </div>
      </div>
    </footer>
  );
}
