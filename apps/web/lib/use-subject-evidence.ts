'use client';

import { useEffect, useState } from 'react';
import type { Axis, Evidence } from '@naught/shared';
import { fetchEvidence } from '@/lib/api';

/**
 * The evidence behind one selected subject, as the panel can render it.
 *
 * A failed fetch is a state of its own and not an empty list: a dossier that
 * could not be read must not look like a subject with nothing behind it.
 */
export type EvidenceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; rows: Evidence[] }
  | { status: 'failed'; reason: string };

/**
 * Fetches when the selection changes and abandons the previous request, so a
 * fast click through the table never shows one subject's evidence under
 * another subject's name.
 *
 * @example
 * const evidence = useSubjectEvidence('deps', selected);
 */
export function useSubjectEvidence(
  axis: Axis,
  subject: string | null,
): EvidenceState {
  const [state, setState] = useState<EvidenceState>({ status: 'idle' });
  useEffect(() => {
    if (subject === null) {
      setState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetchEvidence(axis, subject, controller.signal)
      .then((rows) => setState({ status: 'loaded', rows }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'failed',
          reason: err instanceof Error ? err.message : String(err),
        });
      });
    return () => controller.abort();
  }, [axis, subject]);
  return state;
}
