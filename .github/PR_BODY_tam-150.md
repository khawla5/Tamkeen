# TAM-150 — The front page speaks about paths and the skills they produce

**Branch:** `feature/tam-150-landing-paths` → `main` · Decision **D-129** · §4.0, §4C.4

## Two repairs to `main`, first

The merge that brought TAM-148 and TAM-149 together left two things behind, and both are fixed here:

- **`apps/web/messages/ar.json` was invalid JSON** — the comma after `impactRatePoints` was dropped, so the Arabic catalogue would not parse and every web test and build failed on `main`.
- **Two decisions were both numbered `D-127`.** The English work owns D-123–D-127, so «الأثر» was renumbered **D-127 → D-128** across `decisions.md`, `progress.md`, `tickets.md` and its PR body.

(A third symptom — `packages/types/dist` being stale — is a build step, not a defect: `npm run build --workspace @tamkeen/types`.)

## What was built

**1. The message.** §4.0's explorer stops explaining the product's four stages. The reader the front page is written for is a manager asking what their people will be able to do, so the page now says: the ministry has training paths, each builds a nameable skill set, and an employee is matched to the one that fits their interests and walks it to a certificate. Vocabulary is skills and capabilities throughout — what a path produces, not the screens it is delivered through.

**2. Content is data, not copy.** A path carries `skill_outcomes` (`text[]`, empty by default) beside its description, edited in **§4C.4 next to the description** because the two are written together and read together. Three to five capability nouns, bounded in the DTO — the public page renders the list as-is, so a hundred outcomes would be a wall of text on the ministry's front door. **The lower bound is deliberately not enforced on save:** a path may legitimately have none yet, and refusing to save a half-written list is how an editor loses work. `text[]` rather than a child table: the list is short, always read whole with its path, and never queried across paths.

The seed carries **placeholder** descriptions (rewritten to two or three skill sentences) and 3–5 outcomes for all twelve paths, written from each path's real course list, with four new tests holding the shape (3–5 items, noun phrases not sentences, no duplicates, a description of more than one sentence). **The ticket is not closed until الإدارة العامة للتدريب has signed the copy off** — the same rule the rest of the landing copy already lives under.

**3. The explorer shows paths.** One tab per active path on the shared `Tabs` primitive; each panel carries the path's name, its **career type in Arabic** (the D-099 names — the letter is an internal code and has never been shown, D-126), the skill outcomes as a list, the description, and the **course count and typical duration interpolated from the API**, with the single action «إنشاء حساب». At twelve paths the strip scrolls horizontally and carries its own accessible name. Beneath it, the four stages survive as four lines — «كيف يُطابَق الموظف بمساره» — keeping the interpolated `{count}` / `{min}` / `{max}` the tests assert.

**4. A public, read-only endpoint.** `GET /api/public/paths` returns seven fields for active paths: `@Public()` as the single greppable line, a throttle well below the default, and a **five-minute in-process cache with concurrent misses coalesced**, so however many visitors arrive the database is asked at most once per window. It `select`s its columns rather than filtering a loaded row — a `select` cannot leak a field added to the model later — and both the unit spec and the integration spec assert the **exact key set**. It lives in a module of its own rather than on `PathsModule`, which is `@Roles('EMPLOYEE')` at class level: a public route among guarded ones is one refactor away from inheriting a guard it should not have, or losing one it should.

**5. Hero, FAQ, footer — angle only, no new sections.** The hero body is one sentence on developing employees' skills through structured paths matched to their interests, with the assessment named only as how the match is made; the CTA, eligibility line and the «كيف تعمل المنصة» jump are unchanged. The FAQ stays six native `<details>` of locked rules, re-chosen for a manager: how an employee is matched · what the path certificate attests · can a path be changed · who may register · where courses are studied · how a certificate is verified. The footer line states the platform's purpose in skill-development terms.

**6. The fallback is the rule, not a nicety.** A failed or empty read renders the matching strip alone above one Arabic line saying the paths will appear shortly — never a `DataView` error card. This is the ministry's front door: a visitor must still learn what the platform does and still be able to register when the API is down.

## Two deviations from the ticket, both deliberate (D-129)

1. **The fetch is client-side.** The ticket calls the landing page a server component; it is not — `LandingView` is `'use client'`, and it is mounted twice: at `/landing`, a server route, and at `/`, where `PortalProvider` renders it from the client after a 401. A server fetch would serve one of those and not the other, and one page behaving two ways is worse than one honest fetch. What the instruction was protecting — "a static page must not hit the database per visit" — is solved where it belongs, in the endpoint's cache.
2. **Ordering is career type, then `displayOrder`.** `displayOrder` is curated _within_ a letter (six paths share the value 1), so ordering by it alone interleaves the types and puts the two paths of one kind at opposite ends of a twelve-tab strip. The enum's declaration order is the canonical R-I-A-S-E-C (D-031).

## How it was tested

**A defect the cache spec caught:** the service stamped `Date.now()` while comparing against an injected `now`, so under a test clock nothing ever expired. Two clocks in one cache; now one.

**Proven live** at `/landing` and at `/` against the running app: twelve tabs, the panel showing «النمط المهني: الواقعي» (never the letter), the outcomes list, «يعرض 11 دورة للاختيار منها · نحو 22 ساعة تدريبية» both from the API, ArrowLeft advancing correctly in RTL, the matching strip's four lines with the real numbers, the new FAQ, the reworded hero and footer — no console errors, and no horizontal body scroll at 390px.

**Suites:** API unit **794** across 49 suites (12 new) · **268** integration against real PostgreSQL across `admin-paths`, `admin-rbac` and the new `public-paths` (7 new, written as an exposure test: what an anonymous caller gets, what must never be in it, and that one public read does not open `/api/paths` or `/api/courses`) · web **893** (12 new or rewritten). Typecheck, ESLint and Prettier clean across both apps and `packages/types`.

**Migration applied** to both the development and the e2e databases, and the twelve paths' new copy written to both.

## "Done when" it satisfies

TAM-150's six points. Product rules: §4.0's structure (Hero → explorer → FAQ → Footer, no new sections), Arabic-first with every number interpolated (§2, D-018), WCAG 2.1 AA (a real tablist with RTL-correct arrow keys, a named scrolling strip, no meaning carried by colour alone), and the DGA Platforms Code palette — `primary-50` for the outcomes card, `primary-700` for its marks, no new tokens.

## Docs

`decisions.md` **D-129**. `CLAUDE.md` §4.0 rewritten (explorer, hero, FAQ, footer, copy rules) and §4C.4 extended. `progress.md` 2026-09-01 entry. `tickets.md` TAM-150, marked **DONE, copy sign-off owed**.

## Entity authoring guide

- [x] N/A — this PR touches none of `moodle-plugin/`, the entity Content page, or publish readiness.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01DfTfB8F6GfLJP9Wv322SfG
