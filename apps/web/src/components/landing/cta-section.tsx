import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

export function CtaSection() {
  const t = useTranslations('landing');

  return (
    <section className="bg-navy-soft py-16 sm:py-20">
      <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
        <h2 className="text-3xl font-bold text-white">{t('ctaTitle')}</h2>
        <p className="mt-3 text-white/70">{t('ctaBody')}</p>

        <div className="mt-8">
          <Button asChild size="lg" variant="achievement">
            <Link href="/register">
              {t('heroCta')}
              <ArrowLeft aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
