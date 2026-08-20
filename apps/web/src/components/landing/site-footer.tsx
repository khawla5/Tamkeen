'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { useFormat } from '@/i18n/format-provider';

/**
 * The public footer: the brand and its partnership on the wide first column,
 * then three link columns, on navy under a gold hairline.
 *
 * WHY MOST OF THIS IS TEXT AND NOT LINKS: the reference footer links to
 * opportunities, a skills record, four role dashboards, an about page, contact,
 * privacy and terms. **None of those routes exist in this application** — only
 * sign-in does. A link that 404s is worse than a label: it advertises a page,
 * costs a click to discover it is not there, and reaches a screen-reader user
 * announced as a link with nowhere to go. So each item renders as the word it
 * is, and gains an `href` when the page behind it is built — `FOOTER_GROUPS`
 * carries the optional slot for exactly that.
 */
const FOOTER_GROUPS: Array<{
  titleKey: string;
  items: Array<{ key: string; href?: string }>;
}> = [
  {
    titleKey: 'footerPlatform',
    items: [
      { key: 'footerOpportunities' },
      { key: 'footerSkillsRecord' },
      { key: 'footerAssessment' },
      { key: 'footerSignIn', href: '/login' },
    ],
  },
  {
    titleKey: 'footerDashboards',
    items: [
      { key: 'footerDashStudent' },
      { key: 'footerDashEmployer' },
      { key: 'footerDashUniversity' },
      { key: 'footerDashProvider' },
    ],
  },
  {
    titleKey: 'footerCompany',
    items: [
      { key: 'footerAbout' },
      { key: 'footerContact' },
      { key: 'footerPrivacy' },
      { key: 'footerTerms' },
    ],
  },
];

export function SiteFooter() {
  const t = useTranslations('landing');
  const { year } = useFormat();

  return (
    <footer className="border-t-2 border-gold/40 bg-navy">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/landing" className="inline-block" aria-label={t('brand')}>
              {/* The logo is drawn for light grounds; on navy it needs its own
                  plate rather than a filter, which would recolour the mark. */}
              <Image
                src="/brand/tamkeen_logo_transparent.png"
                alt=""
                width={1216}
                height={504}
                className="h-10 w-auto rounded-lg bg-surface px-3 py-1.5"
              />
            </Link>

            <p className="mt-5 text-sm leading-relaxed text-gold-pale/70">{t('footerTagline')}</p>

            <p className="mt-5 text-sm font-semibold text-white">{t('footerAudience')}</p>

            {/* The university's emblem beside the partnership line, as the
                reference footer sets it. Decorative: the sentence next to it
                already names the institution, so a second announcement of the
                same name would only repeat it. The white plate is the emblem's
                own requirement — it is drawn for light grounds. */}
            <div className="mt-4 flex items-center gap-4">
              <Image
                src="/brand/imsiu_emblem.jpg"
                alt=""
                width={220}
                height={220}
                className="size-20 shrink-0 rounded-lg bg-surface p-1.5 object-contain"
              />
              <p className="max-w-[12rem] text-xs leading-relaxed text-gold-pale/60">
                {t('footerPartnership')}
              </p>
            </div>
          </div>

          {FOOTER_GROUPS.map(({ titleKey, items }) => (
            <div key={titleKey}>
              {/* Light gold on navy is 5.67:1 — a gold that carries text at
                  this size, which plain gold would not. */}
              <h2 className="text-sm font-bold text-gold-light ltr:uppercase ltr:tracking-wider">
                {t(titleKey)}
              </h2>

              <ul className="mt-5 flex flex-col gap-3">
                {items.map(({ key, href }) => (
                  <li key={key} className="text-sm text-gold-pale/70">
                    {href ? (
                      <Link href={href} className="hover:text-gold-light">
                        {t(key)}
                      </Link>
                    ) : (
                      t(key)
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-gold/30 pt-6">
          {/*
            The year comes from the clock, not from a string somebody has to
            remember to bump every January, and it goes through the formatting
            layer so the D-018 digit switch reaches it — via `year` rather than
            `number`, because grouping would render it "2,026". The Latin gloss
            on the brand is part of the logotype, so it stays out of `ar.json`
            for the same reason the wordmark in the header does.
          */}
          <p className="text-center text-sm text-gold-pale/60">
            © {year(new Date().getFullYear())} {t('brand')} <span dir="ltr">(Tamkeen)</span>.{' '}
            {t('footerRights')}
          </p>
        </div>
      </div>
    </footer>
  );
}
