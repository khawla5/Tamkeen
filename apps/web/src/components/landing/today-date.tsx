'use client';

import { useEffect, useState } from 'react';

/**
 * Today's date, both calendars — the empty space in the landing header's nav
 * row, beside the sign-in/create-account controls.
 *
 * Computed only after mount, not from a value passed in from the server: the
 * visitor's own clock and timezone decide "today", and a server-rendered
 * guess could disagree with it and produce a hydration mismatch. Showing
 * nothing for one render is a smaller cost than showing the wrong date.
 */
export function TodayDate() {
  const [today, setToday] = useState<Date | null>(null);

  useEffect(() => {
    setToday(new Date());
  }, []);

  if (!today) {
    return null;
  }

  const gregorian = new Intl.DateTimeFormat('ar-SA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(today);

  /* The Umm al-Qura calendar — the Kingdom's own civil Hijri reckoning —
     rather than the astronomical `islamic` calendar, which can land a day
     off from what a government site's visitors expect. `Intl` already
     appends "هـ"; the Gregorian side gets "م" to match it. */
  const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(today);

  return (
    <div className="hidden items-center gap-2 text-base font-medium text-muted-foreground md:flex">
      <span>{gregorian} م</span>
      <span aria-hidden="true">·</span>
      <span>{hijri}</span>
    </div>
  );
}
