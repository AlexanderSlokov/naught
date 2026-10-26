import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const SRC = join(import.meta.dirname, '..');

/**
 * The guard ADR 0007 put in place of separate files. Version 1 kept "could
 * not see it" rows out of every list of things seen by writing them to a
 * different file; version 2 keeps them in one table, so a reader that globbed
 * it directly could union them back in by forgetting a filter. Only these
 * modules may call `read_parquet`.
 */
const ALLOWED = new Set(['evidence-views.ts', 'v1-rows.ts']);

describe('evidence is read through evidence-views.ts only', () => {
  it('finds read_parquet in no other module', async () => {
    const names = await readdir(SRC, { recursive: true });
    const sources = names.filter(
      (n) => n.endsWith('.ts') && !n.endsWith('.test.ts'),
    );
    const offenders: string[] = [];
    for (const name of sources) {
      const text = await readFile(join(SRC, name), 'utf8');
      if (text.includes('read_parquet(') && !ALLOWED.has(basename(name)))
        offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });
});
