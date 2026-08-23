import type { ReactNode } from 'react';

import { EntityProvider } from '@/components/layout/entity-provider';

/**
 * The entity / reviewer portal (§4B, D-065).
 *
 * A sibling route group to `(portal)`, each with its own provider loading
 * exactly what its portal needs. Sign-in routes an ENTITY account here; a
 * learner who arrives is sent back to theirs.
 */
export default function EntityLayout({ children }: { children: ReactNode }) {
  return <EntityProvider>{children}</EntityProvider>;
}
