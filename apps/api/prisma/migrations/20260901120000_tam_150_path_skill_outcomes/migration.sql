-- TAM-150 — what a path produces, as capability nouns.
--
-- `text[]` rather than a child table: the list is short (three to five), is
-- always read whole with its path, and is never queried across paths. A join
-- table would buy ordering guarantees the array already gives and cost a
-- second read on the public explorer's one query.
--
-- NOT NULL with an empty default, so a path written before its outcomes are
-- authored has an empty list rather than a null the readers must each defend
-- against.
ALTER TABLE "paths"
  ADD COLUMN "skill_outcomes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
