import { useTranslations } from 'next-intl';

export function SiteFooter() {
  const t = useTranslations('landing');

  return (
    <footer className="border-t border-border py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 text-center sm:px-6">
        <span className="text-sm font-semibold text-navy">{t('brand')}</span>
        <span className="text-xs text-muted-foreground">{t('footerClassification')}</span>
      </div>
    </footer>
  );
}
