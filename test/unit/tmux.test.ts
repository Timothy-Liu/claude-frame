import { expect } from 'chai';
import { TmuxClient } from '../../src/core/tmux';

type Recorded = { cmd: string; args: string[] };

function makeFakeExec(results: Record<string, { code: number; stdout?: string; stderr?: string }>) {
  const calls: Recorded[] = [];
  const fn = (cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> => {
    calls.push({ cmd, args });
    const key = [cmd, ...args].join(' ');
    const result = results[key] ?? { code: 0, stdout: '', stderr: '' };
    return Promise.resolve({ code: result.code, stdout: result.stdout ?? '', stderr: result.stderr ?? '' });
  };
  return { fn, calls };
}

describe('TmuxClient', () => {
  it('isAvailable returns true when `which tmux` exits 0', async () => {
    const { fn } = makeFakeExec({ 'which tmux': { code: 0, stdout: '/usr/bin/tmux' } });
    const t = new TmuxClient(fn);
    expect(await t.isAvailable()).to.be.true;
  });

  it('isAvailable returns false when `which tmux` exits non-zero', async () => {
    const { fn } = makeFakeExec({ 'which tmux': { code: 1 } });
    const t = new TmuxClient(fn);
    expect(await t.isAvailable()).to.be.false;
  });

  it('hasSession returns true when has-session exits 0', async () => {
    const { fn, calls } = makeFakeExec({ 'tmux has-session -t abc': { code: 0 } });
    const t = new TmuxClient(fn);
    expect(await t.hasSession('abc')).to.be.true;
    expect(calls[0]).to.deep.equal({ cmd: 'tmux', args: ['has-session', '-t', 'abc'] });
  });

  it('newDetached invokes tmux new-session -d -s NAME CMD ARGS...', async () => {
    const { fn, calls } = makeFakeExec({});
    const t = new TmuxClient(fn);
    await t.newDetached('abc', ['claude', '--resume', 'abc']);
    expect(calls[0]).to.deep.equal({
      cmd: 'tmux',
      args: ['new-session', '-d', '-s', 'abc', 'claude', '--resume', 'abc'],
    });
  });

  it('sendKeys appends C-m by default', async () => {
    const { fn, calls } = makeFakeExec({});
    const t = new TmuxClient(fn);
    await t.sendKeys('abc', 'hello world');
    expect(calls[0]).to.deep.equal({
      cmd: 'tmux',
      args: ['send-keys', '-t', 'abc', 'hello world', 'C-m'],
    });
  });

  it('interrupt sends C-c without C-m', async () => {
    const { fn, calls } = makeFakeExec({});
    const t = new TmuxClient(fn);
    await t.interrupt('abc');
    expect(calls[0]).to.deep.equal({
      cmd: 'tmux',
      args: ['send-keys', '-t', 'abc', 'C-c'],
    });
  });

  it('killSession invokes tmux kill-session -t NAME', async () => {
    const { fn, calls } = makeFakeExec({});
    const t = new TmuxClient(fn);
    await t.killSession('abc');
    expect(calls[0]).to.deep.equal({
      cmd: 'tmux',
      args: ['kill-session', '-t', 'abc'],
    });
  });

});
