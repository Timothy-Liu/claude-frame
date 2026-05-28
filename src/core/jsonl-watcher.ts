export class LineBuffer {
  private partial = '';

  push(chunk: string): string[] {
    const combined = this.partial + chunk;
    const parts = combined.split('\n');
    this.partial = parts.pop() ?? '';
    return parts.filter((l) => l.length > 0);
  }

  flush(): string[] {
    const out = this.partial.length > 0 ? [this.partial] : [];
    this.partial = '';
    return out;
  }
}

import * as fs from 'fs';

export interface Subscription {
  dispose(): void;
}

export function watchJsonl(
  filePath: string,
  onLine: (line: string) => void,
  onMissing?: () => void,
): Subscription {
  const buffer = new LineBuffer();
  let position = 0;
  let closed = false;
  let notifiedMissing = false;

  const readNew = () => {
    if (closed) return;
    fs.stat(filePath, (err, stat) => {
      if (closed) return;
      if (err) {
        if (!notifiedMissing) {
          notifiedMissing = true;
          onMissing?.();
        }
        return;
      }
      if (stat.size < position) {
        // File was truncated/rotated; reset and re-read from start.
        position = 0;
        buffer.flush();
      }
      if (stat.size === position) return;
      const stream = fs.createReadStream(filePath, { start: position, end: stat.size - 1, encoding: 'utf8' });
      stream.on('data', (chunk) => {
        const lines = buffer.push(chunk as string);
        for (const line of lines) onLine(line);
      });
      stream.on('end', () => {
        position = stat.size;
      });
    });
  };

  // Initial read of existing content.
  readNew();

  // Watch for further changes. fs.watch fires 'rename' when the inode goes
  // away (unlink); we treat any subsequent stat failure as "missing".
  const watcher = fs.watch(filePath, () => readNew());

  return {
    dispose: () => {
      closed = true;
      watcher.close();
    },
  };
}
