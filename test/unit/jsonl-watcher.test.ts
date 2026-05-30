import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LineBuffer, watchJsonl } from '../../src/core/jsonl-watcher';

describe('LineBuffer', () => {
  it('emits complete lines and buffers the partial tail', () => {
    const buf = new LineBuffer();
    expect(buf.push('{"a":1}\n{"b":')).to.deep.equal(['{"a":1}']);
    expect(buf.push('2}\n')).to.deep.equal(['{"b":2}']);
  });

  it('handles multiple complete lines in one chunk', () => {
    const buf = new LineBuffer();
    expect(buf.push('a\nb\nc\n')).to.deep.equal(['a', 'b', 'c']);
  });

  it('handles no newline at end (no emit until newline arrives)', () => {
    const buf = new LineBuffer();
    expect(buf.push('partial')).to.deep.equal([]);
    expect(buf.push(' line\n')).to.deep.equal(['partial line']);
  });

  it('ignores empty lines (jsonl is one object per line; blank lines are noise)', () => {
    const buf = new LineBuffer();
    expect(buf.push('a\n\nb\n')).to.deep.equal(['a', 'b']);
  });
});

describe('watchJsonl', () => {
  it('emits each new line appended to the file', (done) => {
    const file = path.join(os.tmpdir(), `watch-${Date.now()}.jsonl`);
    fs.writeFileSync(file, '{"first":1}\n');
    const received: string[] = [];
    const sub = watchJsonl(file, (line) => {
      received.push(line);
      if (received.length === 3) {
        sub.dispose();
        fs.unlinkSync(file);
        expect(received).to.deep.equal(['{"first":1}', '{"second":2}', '{"third":3}']);
        done();
      }
    });
    setTimeout(() => {
      fs.appendFileSync(file, '{"second":2}\n');
      fs.appendFileSync(file, '{"third":3}\n');
    }, 50);
  }).timeout(2000);

  it('invokes onMissing when the file is unlinked mid-watch', (done) => {
    const file = path.join(os.tmpdir(), `watch-missing-${Date.now()}.jsonl`);
    fs.writeFileSync(file, '');
    const sub = watchJsonl(file, () => {}, () => {
      sub.dispose();
      done();
    });
    setTimeout(() => fs.unlinkSync(file), 50);
  }).timeout(2000);
});
