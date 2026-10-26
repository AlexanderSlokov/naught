import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { LockEntry } from './lockfile.js';

const OSV_BATCH = 'https://api.osv.dev/v1/querybatch';

/** One advisory, as OSV lists it against one package version. */
export interface OsvAdvisory {
  id: string;
  /** OSV's `modified`, normalised to ISO; null when absent or unreadable. */
  modified: string | null;
}

/**
 * The one question `deps.osv` asks: which advisories apply to each of these
 * versions. An interface so the collector can be tested without the network.
 */
export interface OsvClient {
  /** One list per entry, in the order given. Throws rather than answer short. */
  advisoriesFor(entries: readonly LockEntry[]): Promise<OsvAdvisory[][]>;
}

export const OSV_CLIENT = Symbol('naught.osv-client');

const OsvBatchResponse = z.object({
  results: z
    .array(
      z.object({
        vulns: z
          .array(
            z.object({
              id: z.string().min(1),
              modified: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .default([]),
});

/**
 * The OSV batch API over HTTP. Read-only: one POST that asks questions and
 * changes nothing.
 */
@Injectable()
export class HttpOsvClient implements OsvClient {
  async advisoriesFor(entries: readonly LockEntry[]): Promise<OsvAdvisory[][]> {
    const res = await fetch(OSV_BATCH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ queries: entries.map(queryOf) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`OSV responded ${res.status}`);
    const body = OsvBatchResponse.parse(await res.json());
    return answersFor(entries.length, body);
  }
}

function queryOf(e: LockEntry): object {
  return { package: { name: e.name, ecosystem: 'npm' }, version: e.version };
}

/**
 * A response with fewer results than queries is a failed request, not a
 * clean one. Version 1 read a missing result as "no advisories", which is the
 * claim `absent_in_scope` exists to make only when it is true (ADR 0007).
 */
export function answersFor(
  asked: number,
  body: z.infer<typeof OsvBatchResponse>,
): OsvAdvisory[][] {
  if (body.results.length !== asked) {
    throw new Error(
      `OSV answered ${body.results.length} of ${asked} queries; expected one result per query`,
    );
  }
  return body.results.map((r) =>
    (r.vulns ?? []).map((v) => ({ id: v.id, modified: isoOrNull(v.modified) })),
  );
}

function isoOrNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : new Date(at).toISOString();
}
