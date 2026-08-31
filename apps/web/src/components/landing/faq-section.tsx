import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Six questions, each answered by a locked product rule — nothing here is a
 * promise the product has not already made.
 *
 * **Re-chosen for the reader the page is now written for (TAM-150).** The set
 * used to answer an employee mid-flow ("what if I fail a quiz", "can I retake
 * the assessment"); a manager arrives asking how their people are matched to a
 * path and what the certificate at the end of it attests. Those two lead, and
 * the retake and quiz-failure questions go — both are answered inside the
 * product, at the moment they are actually asked.
 *
 * Native `<details>`: keyboard and screen-reader behaviour for free, closed by
 * default so the section reads as a list of questions, and no script.
 */
const FAQ_KEYS = ['matched', 'certificate', 'switch', 'who', 'where', 'verify'] as const;

export function FaqSection() {
  const t = useTranslations('landing');

  return (
    <section aria-labelledby="faq-title" className="bg-background py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2 id="faq-title" className="text-3xl font-bold text-foreground">
          {t('faqTitle')}
        </h2>

        <div className="mt-8 divide-y divide-border border-y border-border">
          {FAQ_KEYS.map((key) => (
            <details key={key} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                {t(`faq.${key}.q`)}
                <ChevronDown
                  aria-hidden="true"
                  className="size-5 shrink-0 text-primary-700 transition-transform group-open:rotate-180"
                />
              </summary>
              <p className="pb-5 text-base leading-relaxed text-neutral-700">{t(`faq.${key}.a`)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
