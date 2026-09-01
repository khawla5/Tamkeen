'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { SaudiMap } from '@/components/brand/saudi-map';

/** The ministry headquarters, three high-resolution photos (2263×464 each),
 *  crossfading. The interval lives here, next to the images it cycles. */
const BACKGROUND_PHOTOS = [
  '/landing/moi-headquarters-day.jpg',
  '/landing/moi-headquarters-night.jpg',
  '/landing/moi-headquarters-day-2.jpg',
];

const ROTATION_MS = 2000;

/**
 * The hero of a government front page: who this is for and what it does —
 * one sentence from the BRD's executive summary (§1), in the ministry's own
 * register. No feature pills, no stat row: the paragraph carries the message.
 *
 * **No CTA row, no eligibility line, no sign-in link here.** `SiteHeader`
 * immediately above already offers both "تسجيل الدخول" and "إنشاء حساب" on
 * every scroll position, the explorer just below repeats "إنشاء حساب" per
 * path, and the eligibility line is answered again in the FAQ — stating the
 * same three things a fourth time here read as clutter rather than emphasis,
 * flagged directly against the live page.
 *
 * Two columns from `lg`: the text block on the start edge; on the end edge the
 * ministry emblem over the Kingdom's map, the map revealing region by region. The emblem is decorative here (`alt=""`) —
 * the header already names the ministry, and naming it twice in a row is
 * exactly the duplicate announcement the header tests guard against.
 *
 * No stat row. An internal platform does not need to prove its scale to its
 * own employees, and the only honest figures (path and course counts) belong
 * in the catalogue, where they change.
 */
export function HeroSection() {
  const t = useTranslations('landing');
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    /* A visitor who asked the OS for less motion should not get an
       auto-advancing background regardless of how gentle the crossfade is
       (WCAG 2.3.3) — the first photo simply holds. */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const timer = setInterval(() => {
      setPhotoIndex((index) => (index + 1) % BACKGROUND_PHOTOS.length);
    }, ROTATION_MS);

    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative overflow-hidden bg-primary-deep text-surface lg:min-h-[24rem]">
      {/* The ministry headquarters, behind a dark tint that keeps the white
          text at the contrast ratio D-069's palette work already measured —
          the photo reads as texture, not as a background the copy competes
          with. Both photos are mounted throughout and crossfade on opacity —
          swapping `src` instead would flash to blank while the next one
          decodes, and the first is `priority` so there is no flash on load
          either. */}
      {BACKGROUND_PHOTOS.map((src, index) => (
        <Image
          key={src}
          src={src}
          alt=""
          fill
          priority={index === 0}
          sizes="100vw"
          className="object-cover transition-opacity duration-1000 ease-in-out"
          style={{ opacity: index === photoIndex ? 1 : 0 }}
        />
      ))}
      <div className="absolute inset-0 bg-primary-900/60" />

      {/* The Kingdom's map, every region named — decorative; see SaudiMap.
          Positioned against the section's own left edge rather than inside
          the centred, padded content column below — sitting in-grid there
          only ever placed it as far left as that column's own boundary,
          which was never close to the page edge itself. */}
      <div className="pointer-events-none absolute inset-y-0 end-0 hidden w-[32rem] items-center justify-end lg:flex">
        <div className="flex w-full max-w-md flex-col items-center rounded-2xl p-6">
          <SaudiMap />
        </div>
      </div>

      {/* A direct child of `<section>`, not of any padded/centred wrapper:
          `lg:start-0` has to resolve against the section's own true right
          edge, not against a `max-w-6xl` column's edge — nesting it inside
          one (an earlier version of this) only ever put it as far right as
          that column's own boundary, well short of the page edge on a wide
          screen, the exact mistake already fixed once for the map on the
          other side. Below `lg` it is a normal centred, padded block; the
          `lg:` pairs switch it to an edge-pinned overlay, matching the
          section's own `lg:min-h` floor above instead of contributing to it. */}
      <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-start px-4 py-16 text-start sm:px-6 sm:py-20 lg:absolute lg:inset-y-0 lg:start-0 lg:mx-0 lg:max-w-2xl lg:justify-center lg:px-0 lg:py-0 lg:ps-6">
        <h1 className="text-5xl font-extrabold leading-tight text-surface sm:text-6xl">
          {t('heroTitle')}
        </h1>

        <p className="mt-6 max-w-2xl text-xl leading-relaxed text-primary-50">{t('heroBody')}</p>
      </div>
    </section>
  );
}
