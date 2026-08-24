import { LogOut, User } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { useSignOut } from '@/lib/use-sign-out';

export interface UserMenuProps {
  user: { fullName: string; department?: string };
  /** The role's own profile route; omitted where none exists (the admin). */
  profileHref?: string;
}

/** First letter of the first two name words — the avatar's initials. */
function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/, 2)
    .map((word) => word.charAt(0))
    .join(' ');
}

/**
 * The header's user menu: an avatar that opens the identity block, the profile
 * link and the one sign-out (TAM-112, relocated per D-096). The sidebar footer
 * names the user but acts on nothing — this menu is the single way out, in the
 * same corner on every page.
 */
export function UserMenu({ user, profileHref }: UserMenuProps) {
  const t = useTranslations('app');
  const tNav = useTranslations('nav');
  const tProfile = useTranslations('profile');
  const { signOut, isPending } = useSignOut();

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  /* Click-outside and Escape both close; Escape also restores focus to the
     trigger so a keyboard user is not dropped at the top of the document. */
  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('userMenuLabel')}
        onClick={() => setOpen((current) => !current)}
        className="flex size-9 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-800 transition-colors hover:bg-primary-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
      >
        <span aria-hidden="true">{initials(user.fullName)}</span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={t('userMenuLabel')}
          className="absolute end-0 top-full z-50 mt-2 min-w-56 rounded-lg border border-border bg-card py-1 shadow-lg"
        >
          {/* Identity, not an action: who this menu belongs to. */}
          <div className="border-b border-border px-4 py-2.5">
            <p className="truncate text-sm font-semibold text-foreground">{user.fullName}</p>
            {user.department ? (
              <p className="truncate text-sm text-muted-foreground">{user.department}</p>
            ) : null}
          </div>

          {profileHref ? (
            <Link
              role="menuitem"
              href={profileHref}
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-neutral-50"
            >
              <User aria-hidden="true" className="size-4 text-muted-foreground" />
              {tNav('profile')}
            </Link>
          ) : null}

          <button
            type="button"
            role="menuitem"
            disabled={isPending}
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-neutral-50 disabled:opacity-60"
          >
            <LogOut aria-hidden="true" className="size-4 text-muted-foreground" />
            {isPending ? tProfile('signingOut') : tProfile('signOut')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
