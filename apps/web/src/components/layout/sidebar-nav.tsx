'use client';

import {
  Award,
  BookOpen,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Route,
  ScrollText,
  Settings,
  Stamp,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import type { NavIconName, NavItem } from './nav-items';
import { activeNavHref } from './nav-items';
import { coursesApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

/** Name -> icon resolution lives on the client, so no function crosses the boundary. */
const ICONS: Record<NavIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  courses: BookOpen,
  myPath: Route,
  certificates: Award,
  cv: FileText,
  profile: User,
  learners: Users,
  assessment: ClipboardList,
  settings: Settings,
  templates: Stamp,
  audit: ScrollText,
};

export interface SidebarNavProps {
  items: readonly NavItem[];
  /** Horizontal strip for narrow viewports instead of the vertical rail. */
  orientation?: 'vertical' | 'horizontal';
  /** Nav keys carrying an unseen-items indicator (§2). */
  indicators?: readonly string[];
}

export function SidebarNav({ items, orientation = 'vertical', indicators }: SidebarNavProps) {
  const t = useTranslations('nav');
  const tA11y = useTranslations('a11y');
  const pathname = usePathname();
  /* Exactly one active item: the longest matching href (TAM-140). */
  const activeHref = activeNavHref(
    pathname,
    items.map((item) => item.href),
  );

  /* Only fetched when an item actually asks for the flyout — entity and admin
     nav lists carry no `dropdown` item, so they never pay for this request. */
  const hasDropdown = items.some((item) => item.dropdown);
  const courses = useApiQuery(
    () => (hasDropdown ? coursesApi.list() : Promise.resolve(null)),
    [hasDropdown],
  );

  /* English-language courses only (D-047's `language` field) — the shortcut
     this flyout exists to offer. Capped so a large catalogue does not turn a
     hover menu into a second scrollable page. */
  const englishCourses = useMemo(
    () => (courses.data ?? []).filter((course) => course.language === 'EN').slice(0, 8),
    [courses.data],
  );

  return (
    <ul
      className={cn(
        orientation === 'vertical' ? 'flex flex-col gap-1' : 'flex flex-row gap-1 overflow-x-auto',
      )}
    >
      {items.map((item) => {
        const isActive = item.href === activeHref;
        const Icon = ICONS[item.icon];
        const hasIndicator = indicators?.includes(item.key) ?? false;

        const showDropdown = item.dropdown && englishCourses.length > 0;

        return (
          <li key={item.key} className={cn(showDropdown && 'group relative')}>
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
                  ? /* Platforms Code's light-nav anatomy (TAM-117): the primary
                       start-edge bar, tinted ground and primary text mark the
                       current item; bold weight rides along so position is not
                       signalled by colour alone (WCAG 1.4.1). */
                    'border-primary-600 bg-primary-50 font-semibold text-primary-800'
                  : 'border-transparent text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900',
              )}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span>{t(item.key)}</span>
              {/*
                §2 allows "a light indicator", so it is a dot and not a count —
                a number invites checking, which is the engagement nagging §2
                rules out.

                The dot is `aria-hidden` and paired with visually-hidden text,
                because a bare coloured dot conveys nothing to a screen reader
                and colour alone must never be the only signal (WCAG 1.4.1).
              */}
              {hasIndicator ? (
                <>
                  <span
                    aria-hidden="true"
                    /* primary-600, not the accent tint: on the light rail the
                       accent (primary-50) would vanish into the ground. */
                    className="ms-auto size-2 shrink-0 rounded-full bg-primary-600"
                  />
                  <span className="sr-only">{tA11y('newCertificates')}</span>
                </>
              ) : null}
            </Link>

            {showDropdown ? (
              /*
                Mouse-only, by design (the user's own ask): a plain link to
                `item.href` already sits above and works for every input, so a
                keyboard or touch user loses only the shortcut, never the
                destination. Shown on focus-within too, at no extra cost, so a
                sighted keyboard user tabbing through gets it as well
                (WCAG 1.4.13 — hoverable content should not be hover-only where
                it costs nothing to avoid that).
              */
              <ul
                className={cn(
                  'invisible absolute z-20 min-w-56 rounded-md border border-border bg-card py-1 opacity-0 shadow-lg transition-opacity',
                  'group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100',
                  orientation === 'vertical' ? 'start-full top-0 ms-1' : 'start-0 top-full mt-1',
                )}
              >
                {englishCourses.map((course) => (
                  <li key={course.id}>
                    <Link
                      href={`/courses/${course.id}`}
                      className="block truncate px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
                    >
                      {course.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
