'use client';

import {
  Award,
  BookOpen,
  FileText,
  LayoutDashboard,
  Route,
  User,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import type { NavIconName, NavItem } from './nav-items';
import { cn } from '@/lib/utils';

/** Name -> icon resolution lives on the client, so no function crosses the boundary. */
const ICONS: Record<NavIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  courses: BookOpen,
  myPath: Route,
  certificates: Award,
  cv: FileText,
  profile: User,
};

export interface SidebarNavProps {
  items: readonly NavItem[];
  /** Horizontal strip for narrow viewports instead of the vertical rail. */
  orientation?: 'vertical' | 'horizontal';
}

export function SidebarNav({ items, orientation = 'vertical' }: SidebarNavProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <ul
      className={cn(
        orientation === 'vertical' ? 'flex flex-col gap-1' : 'flex flex-row gap-1 overflow-x-auto',
      )}
    >
      {items.map((item) => {
        /* Exact match for the root so it isn't marked active on every route. */
        const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        const Icon = ICONS[item.icon];

        return (
          <li key={item.key}>
            <Link
              href={item.href}
              /* Announces the current page to assistive tech — WCAG 2.4.8. */
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors',
                /* Logical `border-s` / `border-b`, never physical left/right:
                   the marker must sit on the reading-start edge in RTL. The
                   inactive border is transparent rather than absent so becoming
                   active does not shift the layout. */
                orientation === 'vertical' ? 'border-s-2' : 'border-b-2',
                isActive
                  ? /* Bold weight accompanies the gold edge, so position is not
                       signalled by colour alone (WCAG 1.4.1). */
                    'border-gold bg-white/10 font-semibold text-white'
                  : 'border-transparent text-white/75 hover:bg-white/5 hover:text-white',
              )}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span>{t(item.key)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
