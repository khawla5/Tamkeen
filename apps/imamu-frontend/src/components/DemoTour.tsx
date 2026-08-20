// Self-guided, multi-page demo walkthrough for the STUDENT role. Wraps driver.js
// and drives the actual demo path (Dashboard → Assessment result → CV + score →
// Opportunities → Apply), navigating between routes as the user clicks Next/Prev.
//
// We drive ONE step at a time with driver.highlight() (rather than a steps[]
// array) because the tour crosses React-Router routes: highlight() re-queries
// the selector fresh on every step and refresh() re-positions after the new page
// has laid out, so a navigated step never lands in the corner.
//
// Pages only need to expose `data-tour="<id>"` anchors. Launched manually from
// the dashboard button via `startDemoTour({ lang, navigate })`.

import { driver, type Config } from 'driver.js'
import 'driver.js/dist/driver.css'
import { guideName } from '@/lib/guide'

type Lang = 'en' | 'ar'

interface TourStep {
  route: string // route this step lives on; ':id' is resolved at runtime
  selector: string
  title: { en: string; ar: string }
  description: { en: string; ar: string }
}

const DASHBOARD = '/dashboard/student'

function buildSteps(lang: Lang): TourStep[] {
  const g = guideName(lang)
  return [
    {
      route: DASHBOARD,
      selector: '[data-tour="sd-journey"]',
      title: { en: 'Your career journey', ar: 'رحلتك المهنية' },
      description: {
        en: 'Track every step from your profile to your first job — all in one place.',
        ar: 'تابع كل خطوة من ملفك المهني حتى أول وظيفة — كل ذلك في مكان واحد.',
      },
    },
    {
      route: DASHBOARD,
      selector: '#career-assessment',
      title: { en: 'Career path recommendation', ar: 'توصية المسار المهني' },
      description: {
        en: `Based on your career assessment, ${g} recommends Data Science & AI as your strongest-fit path.`,
        ar: `بناءً على تقييمك المهني، يوصي ${g} بمسار علم البيانات والذكاء الاصطناعي كأفضل مسار يناسبك.`,
      },
    },
    {
      route: '/careers',
      selector: '[data-tour="tour-assessment-result"]',
      title: { en: 'Your assessment result', ar: 'نتيجة تقييمك المهني' },
      description: {
        en: 'The completed result — your top match with strengths and a step-by-step roadmap.',
        ar: 'النتيجة المكتملة — أفضل مسار يناسبك مع نقاط القوة وخارطة طريق خطوة بخطوة.',
      },
    },
    {
      route: '/skills-record',
      selector: '[data-tour="tour-cv-score"]',
      title: { en: 'Your CV, scored', ar: 'سيرتك الذاتية ودرجتها' },
      description: {
        en: 'Your skills record builds your CV automatically and scores its readiness for applications.',
        ar: 'سجلك المهاري يبني سيرتك تلقائياً ويقيس جاهزيتها للتقديم.',
      },
    },
    {
      route: '/opportunities',
      selector: '[data-tour="tour-opportunities-grid"]',
      title: { en: 'Opportunities matched to you', ar: 'فرص مطابقة لك' },
      description: {
        en: 'Jobs and co-op training from Aramco, SDAIA, NEOM and more — sorted by fit.',
        ar: 'وظائف وتدريب تعاوني من أرامكو وسدايا ونيوم وغيرها — مرتبة حسب الملاءمة.',
      },
    },
    {
      route: '/opportunities/:id',
      selector: '[data-tour="tour-apply"]',
      title: { en: 'Apply in one click', ar: 'قدّم بنقرة واحدة' },
      description: {
        en: 'Open any opportunity and submit your application in a single click.',
        ar: 'افتح أي فرصة وقدّم طلبك بنقرة واحدة.',
      },
    },
  ]
}

// Poll for an element to mount after a route change. Resolves null on timeout so
// the tour can end gracefully instead of throwing.
function waitForElement(selector: string, timeout = 5000): Promise<Element | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector)
    if (existing) return resolve(existing)
    const start = performance.now()
    const id = window.setInterval(() => {
      const el = document.querySelector(selector)
      if (el) {
        window.clearInterval(id)
        resolve(el)
      } else if (performance.now() - start > timeout) {
        window.clearInterval(id)
        resolve(null)
      }
    }, 80)
  })
}

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

export function startDemoTour({
  lang,
  navigate,
}: {
  lang: Lang
  navigate: (path: string) => void
}) {
  const steps = buildSteps(lang)
  const total = steps.length

  // The tour is launched from the dashboard, where step 0's anchor exists.
  const startIndex = steps.findIndex((s) => document.querySelector(s.selector))
  if (startIndex < 0) return

  // The final step lives on an opportunity detail page — resolve the concrete id
  // from the first card in the opportunities grid.
  const resolveRoute = (s: TourStep): string => {
    if (!s.route.includes(':id')) return s.route
    const card = document.querySelector('[data-tour="tour-opportunities-grid"] [data-opp-id]')
    const id = card?.getAttribute('data-opp-id')
    return id ? `/opportunities/${id}` : ''
  }

  const config: Config = {
    // Animation OFF: across route changes the 400ms animated transition desyncs
    // the popover content from the spotlight (and leaves navigated steps without
    // an anchored element). Instant highlight keeps every step locked on target.
    animate: false,
    allowClose: true,
    overlayColor: '#0A2E42',
    overlayOpacity: 0.7,
    popoverClass: 'tamkeen-tour',
  }
  const driverObj = driver(config)

  // Self-heal timer: some demo-path pages (careers, skills-record, opportunity
  // detail) fetch data and re-render the anchored subtree AFTER we highlight,
  // which strips driver's `.driver-active-element` class and drops the spotlight.
  // We watch for that and re-apply the highlight until it stays put.
  let healTimer: number | undefined
  const stopHeal = () => {
    if (healTimer !== undefined) {
      window.clearInterval(healTimer)
      healTimer = undefined
    }
  }
  const end = () => {
    stopHeal()
    driverObj.destroy()
  }

  const show = async (index: number): Promise<void> => {
    stopHeal()
    if (index < 0 || index >= total) {
      end()
      return
    }
    const s = steps[index]

    // Navigate + wait if this step's anchor isn't already on the page.
    if (!document.querySelector(s.selector)) {
      const route = resolveRoute(s)
      if (!route) {
        end()
        return
      }
      navigate(route)
      const el = await waitForElement(s.selector)
      if (!el) {
        end()
        return
      }
      // Let the new page finish its first layout before driver measures it.
      await raf()
      await raf()
    }

    const isLast = index === total - 1
    const progress = lang === 'ar' ? `${index + 1} من ${total}` : `${index + 1} of ${total}`

    const paint = () => {
      driverObj.highlight({
        element: s.selector,
        popover: {
          title: s.title[lang],
          // Progress is folded into the description — single-step highlight mode
          // has no built-in progress indicator.
          description: `${s.description[lang]}<div class="tamkeen-tour-progress">${progress}</div>`,
          showButtons: index === 0 ? ['next', 'close'] : ['next', 'previous', 'close'],
          nextBtnText: isLast ? (lang === 'ar' ? 'إنهاء' : 'Done') : lang === 'ar' ? 'التالي' : 'Next',
          prevBtnText: lang === 'ar' ? 'السابق' : 'Previous',
          onNextClick: () => {
            if (isLast) end()
            else void show(index + 1)
          },
          onPrevClick: () => {
            void show(index - 1)
          },
        },
      })
    }

    paint()

    // Keep the spotlight pinned for ~3s: if a late re-render drops the active
    // class, re-apply; otherwise just keep the position fresh. Cheap + invisible
    // (animation is off).
    let ticks = 0
    healTimer = window.setInterval(() => {
      ticks += 1
      const el = document.querySelector(s.selector)
      if (!el) {
        stopHeal()
        return
      }
      if (!el.classList.contains('driver-active-element')) paint()
      else driverObj.refresh()
      if (ticks >= 12) stopHeal()
    }, 250)
  }

  void show(startIndex)
}
