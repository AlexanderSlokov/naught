import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

/** The file kinds a schema version 1 run wrote, beside its `.run.json`. */
const V1_SUFFIXES = ['.obs.parquet', '.blind.parquet'] as const;

/** The manifest the rewriter writes once a version 1 run is verified. */
export const V2_MANIFEST_SUFFIX = '.v2.run.json';

/** One version 1 run on disk, by the stem its files share. */
export interface V1Run {
  readonly dir: string;
  readonly stem: string;
  readonly obs: string | null;
  readonly blind: string | null;
  readonly manifest: string | null;
  /** True once `{stem}.v2.run.json` exists: rewritten and verified. */
  readonly migrated: boolean;
}

/**
 * Every version 1 run under `runsDir`, found by file name. A stem is version 1
 * when it has an `.obs` or `.blind` file; a version 2 run has neither.
 *
 * @example
 * const pending = (await findV1Runs(lake.runsDir)).filter((r) => !r.migrated);
 */
export async function findV1Runs(runsDir: string): Promise<V1Run[]> {
  const files = await listFiles(runsDir);
  const present = new Set(files);
  const stems = new Set(files.flatMap(v1StemOf));
  return [...stems].sort().map((path) => v1RunAt(path, present));
}

function v1RunAt(stemPath: string, present: ReadonlySet<string>): V1Run {
  const at = (suffix: string): string | null =>
    present.has(`${stemPath}${suffix}`) ? `${stemPath}${suffix}` : null;
  return {
    dir: dirname(stemPath),
    stem: basename(stemPath),
    obs: at('.obs.parquet'),
    blind: at('.blind.parquet'),
    manifest: at('.run.json'),
    migrated: present.has(`${stemPath}${V2_MANIFEST_SUFFIX}`),
  };
}

/** The stem path of a version 1 data file, or nothing for any other file. */
function v1StemOf(path: string): string[] {
  const suffix = V1_SUFFIXES.find((s) => path.endsWith(s));
  return suffix ? [path.slice(0, -suffix.length)] : [];
}

async function listFiles(runsDir: string): Promise<string[]> {
  try {
    const names = await readdir(runsDir, { recursive: true });
    return names.map((name) => join(runsDir, name));
  } catch {
    return [];
  }
}

/** RFC 9562 §5.5 name-based UUID, under a namespace owned by this project. */
const NAUGHT_V1_NAMESPACE = 'a5f1c2e0-6b3d-4c8e-9f70-2d1e0b9a7c41';

/**
 * A run id for a version 1 run whose manifest never recorded one. Derived from
 * the stem, so rewriting the same lake twice names the run the same way.
 *
 * @example
 * runIdForStem('deps-osv--163147-02e8a9'); // stable UUIDv5
 */
export function runIdForStem(stem: string): string {
  const namespace = Buffer.from(NAUGHT_V1_NAMESPACE.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(namespace).update(stem).digest();
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
