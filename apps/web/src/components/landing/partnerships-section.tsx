import Image from 'next/image';
import { useTranslations } from 'next-intl';

/**
 * The partner network: the academic partner in a banded card of its own, the
 * participating institutions scrolling beneath it, then the technology and
 * training partners side by side.
 *
 * The names live here rather than in the message catalogs because they are
 * proper nouns — identical in Arabic and English, so a translated pair would be
 * two copies of one string, and Latin institution names inside `ar.json` would
 * trip the guard that exists to catch untranslated copy.
 *
 * Every mark is served from `public/brand/partners/`. In the reference these
 * are bundler imports (`@/assets/...`); Next serves static files from `public/`,
 * so the paths become plain URLs and the files are addressed by name.
 */
const PARTNER_LOGOS: Array<{ name: string; file: string }> = [
  { name: 'Arden University', file: 'ARDEN.png' },
  { name: 'AV', file: 'AV.png' },
  { name: 'CCTB', file: 'CCTB.png' },
  { name: 'FC', file: 'FC.png' },
  { name: 'FMU', file: 'FMU.png' },
  { name: 'HIGHQ', file: 'HIGHQ.png' },
  { name: 'HP', file: 'HP.png' },
  { name: 'HU', file: 'HU.png' },
  { name: 'IBAL', file: 'IBAL.png' },
  { name: 'INT', file: 'INT.png' },
  { name: 'LA', file: 'LA.png' },
  { name: 'LBF', file: 'LBF.png' },
  { name: 'LCCA', file: 'LCCA.png' },
  { name: 'LCCM', file: 'LCCM.png' },
  { name: 'LG', file: 'LG.png' },
  { name: 'LGC', file: 'LGC.png' },
  { name: 'LM', file: 'LM.png' },
  { name: 'London School of Business', file: 'London-business.png' },
  { name: 'MCNY', file: 'MCNY.png' },
  { name: 'MUA', file: 'MUA.png' },
  { name: 'PennState Law', file: 'PennState-Law.png' },
  { name: 'RPI', file: 'RPI.png' },
  { name: 'SABA', file: 'SABA.png' },
  { name: 'SDSU', file: 'SDSU.png' },
  { name: 'TSM', file: 'TSM.png' },
  { name: 'UA', file: 'UA.png' },
  { name: 'UASE', file: 'UASE.png' },
  { name: 'UCW', file: 'UCW.png' },
  { name: 'UE Dubai', file: 'UE-DXB.png' },
  { name: 'UE', file: 'UE.png' },
  { name: 'UL', file: 'UL.png' },
  { name: 'UNFC', file: 'UNFC.png' },
  { name: 'UPES', file: 'UPES.png' },
  { name: 'Berlin School of Business', file: 'berlin-business.png' },
  { name: 'FutureLearn', file: 'future-learn.png' },
  { name: 'GISMA', file: 'gisma.png' },
  { name: 'HTK', file: 'htk.png' },
  { name: 'Pearl', file: 'pearl.png' },
  { name: 'St. Mary', file: 'st-mat.png' },
  { name: 'Trebas', file: 'trebas.png' },
];

const NAMED_PARTNERS: Array<{ labelKey: string; name: string; file: string }> = [
  { labelKey: 'partnerTechnical', name: 'Classperts', file: 'classperts.png' },
  { labelKey: 'partnerTraining', name: 'Be Training', file: 'be-training.png' },
];

function PartnerMark({ name, file }: { name: string; file: string }) {
  return (
    <span className="flex h-[90px] w-[160px] shrink-0 items-center justify-center rounded-xl border border-border bg-surface px-4 py-3">
      <Image
        src={`/brand/partners/${file}`}
        alt={name}
        width={160}
        height={90}
        className="max-h-full w-auto object-contain"
      />
    </span>
  );
}

export function PartnershipsSection() {
  const t = useTranslations('landing');

  return (
    <section id="partnerships" tabIndex={-1} className="scroll-mt-20 bg-surface py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-xs font-bold text-gold-deep ltr:uppercase ltr:tracking-[0.2em]">
            {t('partnershipsEyebrow')}
          </p>
          <h2 className="mt-4 text-3xl font-bold leading-tight text-navy sm:text-4xl">
            {t('partnershipsTitle')}
          </h2>
          <span aria-hidden="true" className="mx-auto mt-4 block h-px w-12 bg-gold" />
        </div>

        <div className="mt-14 overflow-hidden rounded-card border border-border shadow-sm">
          {/* The academic partner gets the filled band: it is the institution
              the platform is built with, not one name among forty. White on
              gold-deep is 5.25:1, the one gold pairing that carries text. */}
          <div className="flex flex-col items-center gap-4 bg-gold-deep px-6 py-10 lg:py-12">
            <Image
              src="/brand/partners/inuni-white.png"
              alt=""
              width={320}
              height={120}
              className="h-20 w-auto object-contain lg:h-24"
            />
            <p className="text-xs font-semibold text-white/75">{t('partnerAcademic')}</p>
            <p className="text-center text-lg font-bold text-white lg:text-xl">
              {t('footerPartnership')}
            </p>
          </div>

          <div className="bg-surface px-6 pt-6 pb-8 lg:px-8">
            <p className="text-xs font-semibold text-muted-foreground ltr:uppercase ltr:tracking-wider">
              {t('partnerUniversities')}
            </p>

            {/*
              The track carries the list twice and travels -50%, so the loop is
              seamless; `marquee-group` pauses it on hover. `overflow-x-auto`
              rather than `hidden` is the accessibility half: the global
              reduced-motion rule stops the animation dead, and without a
              scrollable container that would leave the later logos permanently
              out of reach.

              `dir="ltr"`: these are Latin marks in a fixed order, and the row
              should travel the same way in both languages.
            */}
            <div className="marquee-group mt-5 overflow-x-auto" dir="ltr">
              <ul className="flex w-max gap-6 py-4 animate-marquee-x">
                {PARTNER_LOGOS.map(({ name, file }) => (
                  <li key={name}>
                    <PartnerMark name={name} file={file} />
                  </li>
                ))}

                {/* The second pass exists only to make the loop seamless, so it
                    is hidden from assistive technology — forty duplicate logo
                    names read out twice is noise, not content. */}
                {PARTNER_LOGOS.map(({ name, file }) => (
                  <li key={`${name}-loop`} aria-hidden="true">
                    <PartnerMark name="" file={file} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {NAMED_PARTNERS.map(({ labelKey, name, file }) => (
            <div
              key={name}
              className="flex flex-col items-center gap-5 rounded-card border border-border bg-surface p-8 text-center shadow-sm lg:p-10"
            >
              <Image
                src={`/brand/partners/${file}`}
                alt={name}
                width={320}
                height={120}
                className="h-20 w-auto object-contain lg:h-24"
              />
              <p className="text-xs font-semibold text-muted-foreground ltr:uppercase ltr:tracking-wider">
                {t(labelKey)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
