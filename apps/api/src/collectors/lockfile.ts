import { readFile } from 'node:fs/promises';

export interface LockEntry {
  name: string;
  version: string;
}

export interface LockfileRead {
  entries: LockEntry[];
  /** Keys that were found but could not be split into name and version. */
  unparseable: string[];
}

/**
 * Reads the `packages:` keys out of a pnpm lockfile.
 *
 * Deliberately a parser for one section and not a YAML dependency. The keys
 * are the declared truth — `name@version`, already resolved — and pulling in
 * a YAML library to read them would add an install-time dependency to the
 * one collector whose entire job is to be suspicious of dependencies.
 *
 * A key it cannot split is returned as unparseable, never dropped. The count
 * of those is what keeps the coverage denominator honest.
 */
export async function readPnpmLock(path: string): Promise<LockfileRead> {
  const text = await readFile(path, 'utf8');
  const lines = text.split('\n');

  const entries: LockEntry[] = [];
  const unparseable: string[] = [];
  const seen = new Set<string>();
  let inPackages = false;

  for (const line of lines) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    // A new top-level key ends the section.
    if (/^\S/.test(line)) break;

    // Exactly two spaces, then a non-space: a package key and not one of
    // the nested fields under it.
    const key = /^ {2}'?([^\s'][^']*?)'?:\s*$/.exec(line)?.[1];
    if (!key) continue;

    // pnpm appends resolved peers in parentheses: react-popper@2.3.0(react@19.3.0)
    const bare = key.split('(')[0] ?? key;
    const at = bare.lastIndexOf('@');
    if (at <= 0) {
      unparseable.push(key);
      continue;
    }

    const name = bare.slice(0, at);
    const version = bare.slice(at + 1);
    if (!name || !version) {
      unparseable.push(key);
      continue;
    }

    const id = `${name}@${version}`;
    if (seen.has(id)) continue;
    seen.add(id);
    entries.push({ name, version });
  }

  return { entries, unparseable };
}

/** npm packages, as purls. The unit of Naught's graph. */
export function toPurl({ name, version }: LockEntry): string {
  return `pkg:npm/${name}@${version}`;
}
