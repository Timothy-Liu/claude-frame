import { execFile } from 'child_process';

export type ExecFn = (cmd: string, args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;

export const defaultExec: ExecFn = (cmd, args) =>
  new Promise((resolve) => {
    execFile(cmd, args, (err, stdout, stderr) => {
      const nodeErr = err as NodeJS.ErrnoException | null;
      const code = nodeErr && typeof nodeErr.code === 'number'
        ? nodeErr.code
        : nodeErr ? 1 : 0;
      resolve({ code, stdout: stdout.toString(), stderr: stderr.toString() });
    });
  });

export class TmuxClient {
  constructor(private exec: ExecFn = defaultExec) {}

  async isAvailable(): Promise<boolean> {
    const { code } = await this.exec('which', ['tmux']);
    return code === 0;
  }

  async hasSession(name: string): Promise<boolean> {
    const { code } = await this.exec('tmux', ['has-session', '-t', name]);
    return code === 0;
  }

  async newDetached(name: string, command: string[]): Promise<void> {
    await this.exec('tmux', ['new-session', '-d', '-s', name, ...command]);
  }

  async sendKeys(name: string, text: string): Promise<void> {
    await this.exec('tmux', ['send-keys', '-t', name, text, 'C-m']);
  }

  async interrupt(name: string): Promise<void> {
    await this.exec('tmux', ['send-keys', '-t', name, 'C-c']);
  }

  async killSession(name: string): Promise<void> {
    await this.exec('tmux', ['kill-session', '-t', name]);
  }
}
