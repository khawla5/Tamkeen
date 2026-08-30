'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { SaudiMap } from '@/components/brand/saudi-map';

/** Three real photos of the same building, rotated rather than picking one —
 *  the interval lives here, next to the images it cycles. */
const BACKGROUND_PHOTOS = [
  '/landing/moi-headquarters.jpg',
  '/landing/moi-headquarters-2.jpg',
  '/landing/moi-headquarters-3.jpg',
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
    <section className="relative overflow-hidden bg-primary-deep text-surface">
      {/* The ministry headquarters, behind a dark tint that keeps the white
          text at the contrast ratio D-069's palette work already measured —
          the photo reads as texture, not as a background the copy competes
          with. All three photos are mounted throughout and crossfade on
          opacity — swapping `src` instead would flash to blank while the next
          one decodes, and the first is `priority` so there is no flash on
          load either. */}
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
      <div className="absolute inset-0 bg-primary-deep/78" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:py-24">
        <div className="flex max-w-2xl flex-col items-start text-start">
          <h1 className="text-4xl font-extrabold leading-tight text-surface sm:text-5xl">
            {t('heroTitle')}
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-primary-50">{t('heroBody')}</p>
        </div>

        {/* Owner over territory: the emblem above, the Kingdom's map — every
            region named — beneath it. Both decorative; see SaudiMap. */}
        <div className="hidden flex-col items-center gap-5 rounded-2xl bg-surface/10 p-6 ring-1 ring-surface/15 lg:flex">
          <div className="flex size-36 items-center justify-center rounded-full bg-surface shadow-md">
            <Image
              src="/brand/MOI.svg"
              alt=""
              width={112}
              height={112}
              priority
              unoptimized
              className="size-28"
            />
          </div>
          <SaudiMap />
        </div>
      </div>
    </section>
  );
}
