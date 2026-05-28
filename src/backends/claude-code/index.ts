// src/backends/claude-code/index.ts
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { ChildProcess } from 'child_process';
import type { AgentBackend, Project, Session, SpawnOpts } from '../types';
import type { NormalizedEvent } from '../../core/events';
import { decodeProjectDir, projectsRoot } from './paths';
import { parseLine } from './parser';
import { watchJsonl } from '../../core/jsonl-watcher';
import { defaultExec, type ExecFn, TmuxClient } from '../../core/tmux';
import { generateSessionId, newSessionArgv, printNewArgv, printResumeArgv, resumeArgv, tmuxName } from './cli';

export class ClaudeCodeBackend implements AgentBackend {
  id = 'claude-code';
  displayName = 'Claude Code';
  capabilities = {
    groupByProject: true,
    canPresetSessionId: true,
    supportsTmux: true,
    supportsInterrupt: true,
  };

  // In-flight `claude --print` children for non-tmux sessions. Each
  // sendMessage spawns a one-shot --print process (claude needs a TTY for
  // interactive stdin, which we can't provide cheaply without node-pty).
  // Tracked so interrupt / teardown can signal the running child.
  private inFlight = new Map<string, ChildProcess>();

  constructor(
    private tmux: TmuxClient = new TmuxClient(),
    private exec: ExecFn = defaultExec,
  ) {}

  /** Track an in-flight --print child; auto-clear from the map on exit. */
  private trackInFlight(sessionId: string, child: ChildProcess): void {
    this.inFlight.set(sessionId, child);
    child.on('exit', () => {
      if (this.inFlight.get(sessionId) === child) this.inFlight.delete(sessionId);
    });
  }

  /** Locate a session's .jsonl file and the cwd it belongs to. */
  private findSessionLocation(sessionId: string): { cwd: string; file: string } | undefined {
    const root = projectsRoot();
    if (!fs.existsSync(root)) return undefined;
    for (const d of fs.readdirSync(root)) {
      const candidate = path.join(root, d, `${sessionId}.jsonl`);
      if (fs.existsSync(candidate)) return { cwd: decodeProjectDir(d), file: candidate };
    }
    return undefined;
  }

  async isAvailable(): Promise<boolean> {
    const { code } = await this.exec('which', ['claude']);
    return code === 0;
  }

  async listProjects(): Promise<Project[]> {
    const root = projectsRoot();
    if (!fs.existsSync(root)) return [];
    const dirs = await fs.promises.readdir(root, { withFileTypes: true });
    const out: Project[] = [];
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const full = path.join(root, d.name);
      const files = await fs.promises.readdir(full).catch(() => []);
      const hasJsonl = files.some((f) => f.endsWith('.jsonl'));
      if (!hasJsonl) continue;
      const cwd = decodeProjectDir(d.name);
      out.push({ id: d.name, label: cwd, cwd });
    }
    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
  }

  async listSessions(projectId: string): Promise<Session[]> {
    const dir = path.join(projectsRoot(), projectId);
    if (!fs.existsSync(dir)) return [];
    const files = await fs.promises.readdir(dir);
    const sessions: Session[] = [];
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const id = f.slice(0, -'.jsonl'.length);
      const stat = await fs.promises.stat(path.join(dir, f));
      sessions.push({ id, lastMtime: stat.mtimeMs });
    }
    sessions.sort((a, b) => b.lastMtime - a.lastMtime);
    return sessions;
  }

  watchSession(sessionId: string, onEvent: (e: NormalizedEvent) => void): vscode.Disposable {
    // The session file lives under whichever project dir last touched it.
    // We resolve by scanning all project dirs for <sessionId>.jsonl.
    const root = projectsRoot();
    let resolved: string | undefined;
    if (fs.existsSync(root)) {
      for (const d of fs.readdirSync(root)) {
        const candidate = path.join(root, d, `${sessionId}.jsonl`);
        if (fs.existsSync(candidate)) { resolved = candidate; break; }
      }
    }
    if (!resolved) {
      onEvent({ kind: 'error', message: `Session ${sessionId} not found on disk`, ts: Date.now() });
      return { dispose: () => {} };
    }
    const sub = watchJsonl(
      resolved,
      (line) => { const ev = parseLine(line); if (ev) onEvent(ev); },
      () => onEvent({ kind: 'error', message: 'Session log no longer available', ts: Date.now() }),
    );
    return { dispose: () => sub.dispose() };
  }

  sessionFilePath(projectId: string, sessionId: string): string {
    return path.join(projectsRoot(), projectId, `${sessionId}.jsonl`);
  }

  async spawnNewSession(opts: SpawnOpts): Promise<{ sessionId: string }> {
    const sessionId = generateSessionId();
    const cwd = decodeProjectDir(opts.projectId);
    if (opts.useTmux) {
      const argv = newSessionArgv(sessionId, opts.initialPrompt);
      await this.tmux.newDetached(tmuxName(sessionId), [
        'sh', '-c', `cd ${JSON.stringify(cwd)} && ${argv.map((a) => JSON.stringify(a)).join(' ')}`,
      ]);
    } else {
      // Non-tmux: one-shot `claude --print --session-id <uuid> "<prompt>"`.
      // claude doesn't get a TTY here, so interactive mode wouldn't work; --print
      // is the documented non-interactive path. Session is still persisted to
      // .jsonl (default) so the watcher picks up the user + assistant lines.
      const { spawn } = await import('child_process');
      const argv = printNewArgv(sessionId, opts.initialPrompt);
      const child = spawn(argv[0], argv.slice(1), { cwd, stdio: 'ignore' });
      child.unref();
      this.trackInFlight(sessionId, child);
    }
    return { sessionId };
  }

  async resumeSession(sessionId: string, useTmux: boolean): Promise<void> {
    const loc = this.findSessionLocation(sessionId);
    if (!loc) throw new Error(`Cannot resume: session ${sessionId} not found on disk`);

    if (useTmux) {
      const name = tmuxName(sessionId);
      if (await this.tmux.hasSession(name)) return;
      const argv = resumeArgv(sessionId);
      await this.tmux.newDetached(name, [
        'sh', '-c', `cd ${JSON.stringify(loc.cwd)} && ${argv.map((a) => JSON.stringify(a)).join(' ')}`,
      ]);
      return;
    }

    // Non-tmux: nothing to spawn up-front. Each subsequent sendMessage will
    // spawn `claude --print --resume <id> "<text>"` for a single turn. The
    // session file already exists; the watcher will tail it.
  }

  async sendMessage(sessionId: string, text: string): Promise<void> {
    // Route by which channel actually has a live process for this session:
    // - tmux session present → send-keys
    // - otherwise → one-shot `claude --print --resume <id> "<text>"`
    if (await this.tmux.hasSession(tmuxName(sessionId))) {
      await this.tmux.sendKeys(tmuxName(sessionId), text);
      return;
    }
    const loc = this.findSessionLocation(sessionId);
    if (!loc) throw new Error(`Session ${sessionId} not found on disk`);
    const { spawn } = await import('child_process');
    const argv = printResumeArgv(sessionId, text);
    const child = spawn(argv[0], argv.slice(1), { cwd: loc.cwd, stdio: 'ignore' });
    child.unref();
    this.trackInFlight(sessionId, child);
  }

  async interrupt(sessionId: string): Promise<void> {
    if (await this.tmux.hasSession(tmuxName(sessionId))) {
      await this.tmux.interrupt(tmuxName(sessionId));
      return;
    }
    this.inFlight.get(sessionId)?.kill('SIGINT');
  }

  async teardown(sessionId: string): Promise<void> {
    if (await this.tmux.hasSession(tmuxName(sessionId))) {
      await this.tmux.killSession(tmuxName(sessionId));
      return;
    }
    this.inFlight.get(sessionId)?.kill('SIGTERM');
    this.inFlight.delete(sessionId);
  }
}
