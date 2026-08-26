/**
 * Prisma error codes the admin services act on, recognised by code rather than
 * by `instanceof`.
 *
 * The generated client can be loaded through more than one module instance in a
 * monorepo, so an `instanceof` check against its error classes can silently stop
 * matching — and a check that silently stops matching turns a handled refusal
 * into a 500. The code is the stable contract; the same reasoning
 * `certificate-issuance.service.ts` gives for P2002.
 *
 * Shared by §4C.4's path deletion and §4C.5's course deletion, which both need
 * the same thing: a foreign-key violation raised by the race between checking
 * that nobody holds the row and deleting it, turned into the refusal the check
 * itself would have given.
 */
export function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2003'
  );
}
