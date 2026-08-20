import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Top-bar navigation progress indicator.
 *
 * Modern apps (Vercel, GitHub, YouTube, etc.) flash a thin progress bar at
 * the top of the page on every navigation so the user knows *something is
 * happening* while the next route's chunk and data load. Without it, even a
 * 300ms gap reads as "the click didn't register".
 *
 * Triggered purely from `useLocation()` so it works with the classic
 * `<BrowserRouter>` + `<Routes>` setup (no data-router hooks). The bar runs
 * 0% → 70% → 95% → 100% over ~700ms regardless of what the page is doing —
 * the goal is a *perceived* progress hint, not real progress.
 */
export default function NavigationProgress() {
  const location = useLocation()
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let raf1: number, raf2: number
    let t1: number, t2: number

    setVisible(true)
    setProgress(0)
    // Small delay so the 0 → 70 transition has somewhere to start from.
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => setProgress(70))
    })
    // After 350ms, jump to 95% — covers the typical chunk-load + fetch window.
    t1 = window.setTimeout(() => setProgress(95), 350)
    // After 700ms, snap to 100% and fade.
    t2 = window.setTimeout(() => {
      setProgress(100)
      window.setTimeout(() => {
        setVisible(false)
        setProgress(0)
      }, 220)
    }, 700)

    return () => {
      window.cancelAnimationFrame(raf1)
      window.cancelAnimationFrame(raf2)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [location.pathname])

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[1000] h-[2.5px]"
      aria-hidden="true"
    >
      <div
        className="h-full origin-left bg-gradient-to-r from-imamu-gold via-imamu-warm-gold to-imamu-navy shadow-[0_0_8px_rgba(153,130,63,0.55)]"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
          transition:
            progress === 70 || progress === 95
              ? 'width 0.4s cubic-bezier(.16,1,.3,1)'
              : progress === 100
                ? 'width 0.18s ease-out, opacity 0.22s ease-out 0.18s'
                : 'opacity 0.2s ease-out',
        }}
      />
    </div>
  )
}
