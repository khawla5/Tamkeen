# TAM-149 — «الأثر»: what employees enrolled in, completed and learnt, by period and department

**Branch:** `feature/tam-149-admin-impact` → `main` · Decision **D-128** · §4C.8

## What was built

§4C.8's reports answer "how is the system doing". They have no time axis and no department axis, so they cannot answer what management actually asks: how many of our people took part this quarter, in which directorates, what did they complete, and is it growing. «الأثر» is that question, built as the **first of three tabs** on the shared `Tabs` primitive (TAM-118) — «الأثر» · «التقارير» · «سجل العمليات». The reports and the trail are unchanged behind it, and the admin nav stays at its eight items.

**1. API — `GET /api/admin/impact?from&to&department` → `AdminImpactView`**

One service (`admin-impact.service.ts`) plus a pure `impact-period.ts` for the date arithmetic. **Aggregation only** — every column it reads exists today (`users.created_at` / `email_verified_at` / `department`, `assessment_results.completed_at`, `user_paths.confirmed_at`, `completions.completed_at` / `passed` / `grade_percent`, `certificates.issued_at`, `courses.duration_minutes`). Nothing is stored, cached or materialised: a report is a question about the present, which is the reasoning the reports tab is already built on. It sits on the audit controller, so `admin-rbac.e2e-spec.ts` covers it the moment it is routable. Read-only, so nothing is audited beyond the `AUTHZ_DENIED` the guard already writes.

**2. Four rulings, each of which a plausible implementation gets quietly wrong** (D-128)

- **The comparison is a window of equal length, not the previous calendar period.** Q2 has ninety-one days and Q3 ninety-two — a calendar-to-calendar delta reports about a per cent of "growth" that is nothing but the length of the months. Equal-length shifting also keeps the contract at `from`/`to`: which preset the screen was showing never becomes a vocabulary the API has to branch on. For the default period — a calendar month — the shift lands exactly on the previous month.
- **The participation rate is cumulative, and the tile names its denominator.** "Confirmed this quarter ÷ registered this quarter" can exceed one hundred per cent (someone who registered last year and committed this one is in the numerator and not the denominator), so it is not a rate. Both halves count to the period's end. The denominator is **accounts, not the ministry's headcount**, which the platform has no way of knowing — the screen says so rather than letting a figure be quoted upward as workforce participation. A `MINISTRY_HEADCOUNT` setting could replace it later; noted, not built.
- **A pass with no LMS timestamp is dated by when we recorded it.** `completions.completed_at` is the right date but is legitimately null on a course whose completion criteria carry no timestamps (D-038). Filtering on it alone would put such a pass in no period at all — invisible in every impact report while still counting in the reports tab's running total.
- **Counts are people, de-duplicated, employees only.** Read through `user` with relation filters rather than by counting child rows, so a retake is one assessed employee (D-033) and six passed courses are one active learner. `role: EMPLOYEE` everywhere, including the rate's denominator: an administrator's account is not the ministry's workforce taking part in training.

**3. Two things are said out loud rather than left to be inferred**

A pass whose course has no `duration_minutes` (D-035) contributes no hours, and the count of such passes travels with the total so the screen can state it — a silently short figure is worse than a stated gap. And the language-level block renders «لم يُفعَّل اختبار المستوى بعد» rather than an empty list: `cefr` is `null` in the contract until TAM-148 ships, which is what makes "not enabled" distinguishable from "nobody took it".

Paths completed are read from the **path certificate**, not from `user_paths`: issuance is idempotent and happens the moment the last course is passed (§5.5), so the certificate row is the only durable record of _when_ — `user_paths` carries a status and an `updated_at` that any later write moves.

**4. Web — `components/admin/impact-tab.tsx`**

Period preset (this month / quarter / year / a chosen range) with both resolved dates always visible, the `DEPARTMENTS` filter, five participation tiles each carrying its delta (a fall reads as a fall, no change reads as «بلا تغيير», the rate's own delta in percentage **points**), the four counts per department as a sortable `Table` with real `aria-sort` and keyboard-reachable header buttons, four learning tiles, a twelve-month trend on the token palette (`bg-primary-600` / `bg-primary-800` on `bg-neutral-200` — no charting dependency; every row prints both numbers so it survives a printer that drops backgrounds, WCAG 1.4.1), top courses / top paths / the six career types in Arabic, CSV export and print.

The audit page moved off its hand-rolled tab buttons onto the shared `Tabs` (real `tab`/`tabpanel`, RTL-correct arrow keys); `download()` was extracted to `lib/download.ts` so both §4C.8 exports share one implementation; `useFormat` gained `monthYear`.

**5. Export and print**

The CSV is rendered in the browser over the shared `toCsv` for D-112's reason — every column of it is Arabic copy, and that lives in the message catalogue — with the period in its filename and a caption row before each multi-column block. Printing is a **stylesheet**: `@page` A4, the shell's nav / user menu / skip link marked `data-print="chrome"` and dropped, the owner's lockup and the classification strip kept, because a sheet that leaves a government office has to say whose it is. No second renderer — the Puppeteer path stays where the typography has to be exact, on certificates and the CV.

## How it was tested

**Proven in the running app** as a super-admin against the dev database (451 verified accounts, 205 assessed, 68 committed, 5 active across 6 departments; 5 passes / 15 hours / 26 course certificates in August): the tab opens first, the tiles carry their deltas, the department table sorts, narrowing to «المديرية العامة للأمن العام» re-queries the API (138 / 84 / 39, rate 28%), the year preset re-anchors the period line, the CEFR block states it is not enabled, the export downloads 39 readable rows, and «التقارير» and «سجل العمليات» still work. No console errors.

**Two defects that live run caught, both fixed here:** the rate tile carried no comparison at all — the contract had `previousParticipationRate` and the screen ignored it; and the CSV filename was sliced from the response's ISO instant, so a year selected in Riyadh downloaded as `tamkeen-impact-2025-12-31_2026-12-31`, a different period from the one inside the file.

**Suites:** API unit **696** across 44 suites (32 new — 17 service, 15 period arithmetic) · **21** admin-audit integration against real PostgreSQL (5 new: the default month, the shifted window, the department narrowing, a bad date, an unknown parameter) · **182** admin-rbac integration, which now enumerates `get /api/admin/impact` · web **832** across 60 files (22 new). Typecheck, ESLint and Prettier clean across both apps and `packages/types`.

**Not run:** the Playwright suite. It gained three cases (the impact tab opens first, the export filename carries the period, the reports tab reached by its tab) but needs the built apps, and the dev servers were holding ports 3000/4000.

## "Done when" it satisfies

TAM-149's five acceptance points in `tickets.md`. Product rules: §4C.8's read-only discipline (no write path added), §3's no-redundant-UI (one «مسارات مكتملة» tile, not a second one restating the path-certificate count), §2B's loading/empty/error states via `DataView`, WCAG 2.1 AA (a real tablist, `aria-sort`, no meaning carried by colour alone), and D-018 — every number and date goes through the shared formatting layer.

## Docs

`decisions.md` **D-128**. `progress.md` 2026-08-31 entry. `tickets.md` TAM-149 marked done, with what is deliberately owed: `MINISTRY_HEADCOUNT` as the rate's denominator, and the CEFR block's content once TAM-148 ships.

## Entity authoring guide

- [x] N/A — this PR touches none of `moodle-plugin/`, the entity Content page, or publish readiness.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01DfTfB8F6GfLJP9Wv322SfG
