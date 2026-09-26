'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseRunEvent, type Axis } from '@naught/shared';
import { runStreamUrl, startRun } from '@/lib/api';
import {
  PICKUP_MS,
  QUIET,
  reduce,
  refused,
  stalled,
  starting,
  type CollectionRunState,
  type RunPhase,
} from '@/lib/run-state';

/** Reconnect delay after the socket drops, in milliseconds. */
const RETRY_MS = 2000;

/** How the hook hands a new state back. */
type Apply = (next: (prior: CollectionRunState) => CollectionRunState) => void;

/**
 * Follows collection runs on the API's socket, and starts one on request.
 *
 * The socket is the only account of a run in flight — the lake holds sealed runs
 * and nothing else — so the state here is authoritative until `sealed` arrives,
 * at which point the server-rendered page is refreshed and the lake becomes
 * authoritative again.
 *
 * The fold itself lives in `run-state.ts`; this is the socket, the timers and
 * the refresh.
 *
 * @example
 * const { state, start } = useCollectionRun('deps');
 * <Button disabled={state.phase === 'running'} onClick={start} />
 */
export function useCollectionRun(axis: Axis): {
  state: CollectionRunState;
  start: () => Promise<void>;
} {
  const [state, setState] = useState<CollectionRunState>(QUIET);
  const router = useRouter();
  useStalledQueueWatchdog(state.phase, setState);
  useRunStream(setState, router.refresh);

  const start = useCallback(async () => {
    setState(starting);
    try {
      await startRun(axis);
    } catch (err) {
      setState((prior) => refused(prior, err));
    }
  }, [axis]);

  return { state, start };
}

/** One socket for the life of the component, reopened whenever it drops. */
function useRunStream(apply: Apply, onSealed: () => void): void {
  const sealed = useRef(onSealed);
  sealed.current = onSealed;

  useEffect(() => {
    const stream = openStream(apply, () => sealed.current());
    return () => stream.close();
  }, [apply]);
}

/**
 * The API is the only writer, so there is nothing to replay on reconnect: the
 * first frame is a snapshot of the present.
 */
function openStream(apply: Apply, onSealed: () => void): { close: () => void } {
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const connect = (): void => {
    socket = new WebSocket(runStreamUrl());
    socket.onopen = () => apply((prior) => ({ ...prior, connected: true }));
    socket.onmessage = (frame) => {
      const event = parseRunEvent(String(frame.data));
      if (event === null) return;
      apply((prior) => reduce(prior, event));
      if (event.type === 'sealed') onSealed();
    };
    socket.onclose = () => {
      apply((prior) => ({ ...prior, connected: false }));
      if (!closed) retry = setTimeout(connect, RETRY_MS);
    };
  };

  connect();
  return {
    close: () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    },
  };
}

/** Turns a run that was queued and never started into a visible failure. */
function useStalledQueueWatchdog(phase: RunPhase, apply: Apply): void {
  useEffect(() => {
    if (phase !== 'starting') return;
    const timer = setTimeout(() => apply(stalled), PICKUP_MS);
    return () => clearTimeout(timer);
  }, [phase, apply]);
}
