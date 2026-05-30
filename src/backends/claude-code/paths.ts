import * as os from 'os';
import * as path from 'path';

export function encodeCwd(cwd: string): string {
  return cwd.replaceAll('/', '-');
}

/**
 * Decode a Claude Code project directory name back to an absolute cwd.
 *
 * NOTE: This inverse is LOSSY for paths containing literal hyphens. For
 * example, `/home/tim-othy/repos` encodes to `-home-tim-othy-repos`, which
 * decodes back to `/home/tim/othy/repos` (wrong). This matches Claude Code's
 * own encoding scheme — there is no metadata-free recovery from the dir name
 * alone. For paths without hyphens, the round-trip is exact.
 *
 * A future improvement could parse the `cwd` field from the first session
 * JSONL line in the directory; for now, callers should treat the decoded
 * value as a best-effort label, not an authoritative cwd.
 */
export function decodeProjectDir(dir: string): string {
  return dir.replaceAll('-', '/');
}

export function projectsRoot(): string {
  return path.join(os.homedir(), '.claude', 'projects');
}

export function projectDir(cwd: string): string {
  return path.join(projectsRoot(), encodeCwd(cwd));
}
