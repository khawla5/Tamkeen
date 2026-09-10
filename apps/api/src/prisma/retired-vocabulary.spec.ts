import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Acceptance criterion 13 of the D-134 brief, for the *code* rather than the
 * schema: the retired model is gone from the source, not merely unused.
 *
 * `schema.spec.ts` proves the columns went. This proves the vocabulary went
 * with them — because a surviving `riasecLetter` or `ADD_TO_PATH` is not dead
 * weight, it is a concept the next person to read the file will implement
 * against. Both instruments, the recommendation model and the build flow were
 * one interlocking design, and a leftover fragment of it reads as the design
 * still being live.
 *
 * **Comments are exempt, deliberately.** Several of them explain what was
 * removed and why, which is the most useful thing a comment can say about a
 * retired concept — and D-134's own entry in `decisions.md` is where the reader
 * is sent. What is forbidden is an *identifier*.
 */

/** Every `.ts` file under a directory, tests included. */
function sources(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);

    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === 'dist' ? [] : sources(path);
    }

    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [path] : [];
  });
}

/**
 * Strips comments and string literals.
 *
 * Prose is allowed to name the dead; an identifier is not. Arabic copy is a
 * string literal, so «تقييم الميول المهنية» in a message catalogue would not
 * trip this either — that catalogue has its own completeness test.
 */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/`(?:[^`\\]|\\.)*`/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, ' ')
    .replace(/"(?:[^"\\\n]|\\.)*"/g, ' ');
}

/* All three workspaces: most of the retired model was UI, and a guard that
   watched only the API would have let the web app keep it. Read off disk rather
   than imported, so this runs from the API's own jest config. */
const ROOTS = [
  join(__dirname, '..'),
  join(__dirname, '../../../../packages/types/src'),
  join(__dirname, '../../../web/src'),
];

/**
 * The two files whose job is to name the dead.
 *
 * This one carries the patterns below, and `schema.spec.ts` carries the same
 * check for the schema text. Exempting them by name rather than teaching the
 * stripper about regex literals: the exemption is a short list a reader can
 * verify, and a cleverer stripper would be a second thing to get wrong.
 */
const GUARDS = ['retired-vocabulary.spec.ts', 'schema.spec.ts'];

const FILES = ROOTS.flatMap(sources).filter(
  (file) => !GUARDS.some((guard) => file.endsWith(guard)),
);

/** One entry per retired concept, named so a failure says which. */
const RETIRED: Array<{ concept: string; pattern: RegExp }> = [
  { concept: 'the RIASEC instrument (D-134)', pattern: /\briasec/i },
  { concept: 'the Holland code (D-134)', pattern: /\bholland/i },
  { concept: 'the English/CEFR instrument (D-123–D-126, retired by D-134)', pattern: /\bcefr\b/i },
  {
    concept: 'assessment assignment (D-132/D-133, retired by D-134)',
    pattern: /assessmentAssignment/,
  },
  { concept: 'the 5-10 build flow (D-134)', pattern: /userPathCourse|ADD_TO_PATH/ },
  { concept: '«عامة» courses (D-119, retired by D-134)', pattern: /isGeneral/ },
  {
    concept: 'the membership approval queue (D-119, retired by D-134)',
    pattern: /PATH_MEMBERSHIP_APPROVAL/,
  },
];

describe('the retired vocabulary is gone from the code (D-134, criterion 13)', () => {
  it('found source files to check', () => {
    /* Without this, a broken path would make every assertion below vacuously
       pass over an empty list — the same trap `admin-rbac` guards against. */
    expect(FILES.length).toBeGreaterThan(100);
  });

  it.each(RETIRED)('$concept names nothing', ({ pattern }) => {
    const offenders = FILES.filter((file) => pattern.test(code(readFileSync(file, 'utf8')))).map(
      (file) => file.replace(join(__dirname, '../..'), ''),
    );

    expect(offenders).toEqual([]);
  });
});
