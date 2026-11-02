import { useMemo } from 'react';
import { useStore } from './store';
import { ctxFor } from './lib/plan';

export function useCtx() {
  const project = useStore((s) => s.project);
  const eventId = useStore((s) => s.eventId);
  return useMemo(() => ctxFor(project, eventId), [project, eventId]);
}

/** Module-level drag payload (HTML5 DnD cannot read data during dragover). */
export const dnd: { ids: string[] | null } = { ids: null };
