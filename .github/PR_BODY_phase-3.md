# Phase 3 — Certificates + CV

Closes the achievement and output layer: passing a course yields a verifiable Arabic certificate, finishing a path yields the larger one, and a learner can build and export an English CV pre-filled with what they have earned.

Branch: `phase-3-certificates-cv` → `main`. **Please review; do not expect me to merge** (D-008).

---

## What was built

**The PDF pipeline, proved first.** Before anything was built on it, a spike rendered four sample documents through headless Chromium and checked them mechanically: Arabic positional letter forms and lam-alef ligatures, bidi runs mixing Arabic with Latin and numerals, an English LTR document carrying inline Arabic proper nouns, and a QR decoded back _out of the rendered PDF_ at 72, 144 and 288 dpi. Every later checkpoint reuses that same pipeline, so nothing about Arabic rendering was discovered late.

**Course certificates**, issued at the `onCoursePassed` seam Phase 2 left. Idempotency is enforced here rather than inherited — D-042 §5 is explicit that the caller's transition guard is a spam guard, not a uniqueness one. Three mechanisms hold: check-before-issue, unique indexes per `(user, type, target)`, and a caught unique violation that turns a lost race into the answer the winner got. Rendering happens _before_ the insert, so a crash costs a retry rather than leaving a row pointing at bytes that were never written.

**Path certificates**, at a new `onPathCompleted` seam — and a Phase 2 defect corrected along the way (see below).

**Public verification** at `/verify/<id>`, the only unauthenticated read in the product. The service asks the database for four columns, so employee id, email, department and grade are never _loaded_ on that path. An unknown id is a 404, never a payload saying "invalid".

**The certificates gallery** (§4.10), and the nav items D-037 deliberately withheld until the pages behind them existed.

**Notifications** — the certificate link folded into the existing course-passed email rather than a second message, a new dedicated path-completed email, and an in-app dot cleared by opening the gallery.

**The CV builder** (§4.11, D-050): Arabic-first chrome over English content, repeatable sections with add/remove/reorder, a live preview, and an English PDF export with Arabic proper nouns passing through as authored.

---

## A defect this phase found and fixed

Phase 2 finished a path when every chosen course read `COMPLETED` — a status set from the LMS's completion signal **alone**. D-042 §4 is explicit that passing needs the signal _and_ the grade, so a learner could finish all five courses in Moodle, score below the threshold on every one, and have their path marked complete. Phase 3 would then have certified it.

Both the path status and the certificate now gate on `completions.passed`. Proven against a real database: the path was **refused while 5/5 chosen courses read `COMPLETED`** with one at 45% against a threshold of 70, then issued once that course passed. (D-054)

---

## Two changes that were not in scope but could not be left

- **Node 20 → 24.** Puppeteer 25 is ESM-only and loading it from CommonJS needs Node's `require(esm)`, which forced the version question — and the answer was overdue regardless: **Node 20 is past end of life**, which is not a runtime to launch a government system on. (D-055)
- **`CERT_STORAGE_DIR` is relative by default**, and `npm run --workspace` starts the API with its own directory as cwd — so the server wrote certificates somewhere the rest of the system did not look, and downloads 500'd. Pinned absolute for tests and **flagged for deployment**: a relative storage root for credentials means the bytes move if anything changes the working directory. (D-052)

---

## How it was tested

| Layer                              | Count   |
| ---------------------------------- | ------- |
| Unit (api + web + types, 18 files) | **455** |
| API integration, real PostgreSQL   | **137** |
| Browser end-to-end, Chromium       | **19**  |
| **Total automated**                | **611** |

Typecheck, lint and format clean. `npm audit` unchanged at the 3 accepted `deepmerge-ts` advisories (D-043) — puppeteer and qrcode added none.

**Browser e2e for this phase:** a certificate reaches the gallery and the nav indicator announces it → the gallery clears it → it downloads as a PDF → a signed-out stranger in a fresh context verifies it and sees only name, title, date and "valid" → the CV builder opens with that certificate already listed → an experience entry is added, saved, and exported as a real English PDF.

**That CV export is a real render**, through the running API's own Chromium — which also covers the gap where Jest cannot load Puppeteer at all.

**Two real-Chromium verification scripts** back the parts a browser cannot reach: `spike/pdf/verify-issuance.ts` (issuance and idempotency against real PostgreSQL — three issuances yielding one row, Postgres refusing a targetless certificate) and `spike/pdf/verify-cv-export.ts` (a real CV PDF, with every English probe extracting cleanly, which is what makes it readable to applicant-tracking systems).

**Stated plainly:** the certificate in the browser suite is _seeded_, not earned. The mock LMS cannot be told to report a pass over HTTP, and shipping a test-only endpoint that manufactures completions into a government system is the wrong trade for an easier test. Issuance is covered by unit tests and the script above; Phase 7's acceptance test against a real Moodle closes the loop properly.

---

## Phase 3 "done when"

> Completing courses yields correct, non-duplicated Arabic certificates each with a working verification URL/QR; completing a whole path yields the path certificate; a user can build and export a CV pre-filled with their certifications.

All satisfied. Note the CV is **English** per D-050, which supersedes the "Arabic CV" wording in the original phase text.

---

## Decisions recorded

D-051 (certificate face) · D-052 (immutable certificates, on-demand CV, storage root) · D-053 (public verification id) · D-054 (path completion requires passes) · D-055 (Node 24, lazy Puppeteer) · D-056 (one CV renderer, `en` locale) · D-057 (authored vs system-known CV data) · D-058 (the in-app dot).

Progress log entry: `progress.md` → "2026-08-20 — Phase 3 complete; PR opened for review".

---

## ⚠ Before any certificate reaches a real employee

**The ministry logo, seal and signatory are still missing.** Certificates ship with a neutral placeholder mark and an empty signature block. The slots are sized and positioned so the real artwork is a drop-in, not a layout change — but this needs supplying before issuance to anyone real.
