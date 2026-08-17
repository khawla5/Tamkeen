import type { ReactNode } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Single-column, centred frame for the authentication pages (§4.1).
 *
 * No navigation, no marketing, no social login — an unauthenticated visitor has
 * exactly one thing to do on each of these screens.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {/* One h1 per page, and it is the page's purpose. */}
            <span className="sr-only">{title}</span>
          </CardTitle>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
        {footer ? (
          <div className="border-t border-border px-6 py-4 text-sm text-muted-foreground">
            {footer}
          </div>
        ) : null}
      </Card>
    </main>
  );
}
