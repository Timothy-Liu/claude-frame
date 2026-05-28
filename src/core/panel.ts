// src/core/panel.ts
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { AgentBackend, Session } from '../backends/types';
import type { NormalizedEvent } from './events';
import type { HostToWebview, WebviewToHost } from '../webview/messages';
import { SessionMetadataStore } from './metadata';
import { TmuxClient } from './tmux';
import { pickDefaultProject } from './project-selector';

export class ChatPanel {
  private panel: vscode.WebviewPanel;
  private currentProjectId?: string;
  private currentSessionId?: string;
  private watchSub?: vscode.Disposable;
  private tmux = new TmuxClient();

  constructor(
    private context: vscode.ExtensionContext,
    private backend: AgentBackend,
    private store: SessionMetadataStore,
    private onDispose?: () => void,
  ) {
    this.panel = vscode.window.createWebviewPanel(
      'claudeFrame',
      'Claude Frame',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist'),
                             vscode.Uri.joinPath(context.extensionUri, 'images')] },
    );
    this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.png');
    this.panel.webview.html = this.renderHtml();
    this.panel.webview.onDidReceiveMessage((msg: WebviewToHost) => this.onMessage(msg));
    this.panel.onDidDispose(() => this.dispose());
  }

  private renderHtml(): string {
    const htmlPath = path.join(this.context.extensionPath, 'dist', 'webview', 'index.html');
    const tpl = fs.readFileSync(htmlPath, 'utf8');
    const cssUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'index.css')).toString();
    const jsUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'index.js')).toString();
    return tpl
      .replaceAll('${webviewCspSource}', this.panel.webview.cspSource)
      .replaceAll('${cssUri}', cssUri)
      .replaceAll('${jsUri}', jsUri);
  }

  private send(msg: HostToWebview) { this.panel.webview.postMessage(msg); }

  /** Fetch sessions and overlay persisted per-session titles from globalState. */
  private async listSessionsWithTitles(projectId: string): Promise<Session[]> {
    const sessions = await this.backend.listSessions(projectId);
    return sessions.map((s) => {
      const meta = this.store.getSessionMeta(this.backend.id, s.id);
      return meta?.title ? { ...s, title: meta.title } : s;
    });
  }

  private async onMessage(msg: WebviewToHost): Promise<void> {
    switch (msg.type) {
      case 'ready':
        await this.init();
        break;
      case 'selectProject':
        await this.selectProject(msg.projectId);
        break;
      case 'selectSession':
        this.currentSessionId = msg.sessionId;
        await this.loadSession(msg.sessionId);
        break;
      case 'resume':
        await this.handleResume(msg.sessionId, msg.useTmux);
        break;
      case 'requestNewPrompt': {
        const prompt = await vscode.window.showInputBox({
          title: 'New Claude Frame',
          prompt: 'Initial prompt',
          placeHolder: 'What would you like to ask?',
        });
        if (prompt) await this.handleNew(prompt, msg.useTmux);
        break;
      }
      case 'send':
        if (this.currentSessionId) {
          try {
            await this.backend.sendMessage(this.currentSessionId, msg.text);
          } catch (e) {
            this.send({ type: 'banner', message: (e as Error).message });
          }
        }
        break;
      case 'interrupt':
        if (this.currentSessionId) await this.backend.interrupt(this.currentSessionId);
        break;
      case 'terminate':
        if (this.currentSessionId) await this.backend.teardown(this.currentSessionId);
        break;
      case 'renameTitle':
        if (this.currentSessionId) await this.store.setSessionMeta(this.backend.id, this.currentSessionId, { ...(this.store.getSessionMeta(this.backend.id, this.currentSessionId) ?? {}), title: msg.title });
        this.panel.title = msg.title;
        break;
      case 'setColor':
        if (this.currentSessionId) await this.store.setSessionMeta(this.backend.id, this.currentSessionId, { ...(this.store.getSessionMeta(this.backend.id, this.currentSessionId) ?? {}), color: msg.color });
        break;
      case 'copySelected':
        // No-op on host side; webview handles clipboard. Hook exists for future export.
        break;
      case 'refresh':
        await this.init();
        break;
    }
  }

  private async init(): Promise<void> {
    this.send({ type: 'banner', message: null });
    const tmuxAvailable = this.backend.capabilities.supportsTmux && await this.tmux.isAvailable();
    this.send({ type: 'init', backendDisplayName: this.backend.displayName, capabilities: { groupByProject: this.backend.capabilities.groupByProject, supportsTmux: this.backend.capabilities.supportsTmux }, tmuxAvailable });

    if (!(await this.backend.isAvailable())) {
      this.send({ type: 'banner', message: `${this.backend.displayName} CLI not found on PATH. Install it to use this panel.` });
      this.send({ type: 'projects', projects: [] });
      return;
    }

    const projects = await this.backend.listProjects();
    const workspaceCwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const lastProjectId = this.store.getLastProject(this.backend.id);
    const def = pickDefaultProject(projects, workspaceCwd, lastProjectId);
    this.send({ type: 'projects', projects, selectedId: def?.id });
    if (def) await this.selectProject(def.id);
  }

  private async selectProject(projectId: string): Promise<void> {
    const projects = await this.backend.listProjects();
    if (!projects.find((p) => p.id === projectId)) {
      // Project vanished — show toast, reload list, pick a default.
      vscode.window.showWarningMessage(`Project ${projectId} no longer exists. Showing first available.`);
      const workspaceCwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const def = pickDefaultProject(projects, workspaceCwd, undefined);
      if (!def) {
        this.send({ type: 'projects', projects: [] });
        this.send({ type: 'sessions', sessions: [] });
        return;
      }
      projectId = def.id;
      this.send({ type: 'projects', projects, selectedId: projectId });
    }
    this.currentProjectId = projectId;
    await this.store.setLastProject(this.backend.id, projectId);
    const sessions = await this.listSessionsWithTitles(projectId);
    const firstId = sessions[0]?.id;
    this.send({ type: 'sessions', sessions, selectedId: firstId });
    if (firstId) {
      this.currentSessionId = firstId;
      await this.loadSession(firstId);
    }
  }

  private async loadSession(sessionId: string): Promise<void> {
    this.send({ type: 'reset' });
    this.send({ type: 'sessionId', sessionId });
    this.watchSub?.dispose();
    this.watchSub = this.backend.watchSession(sessionId, (ev: NormalizedEvent) => this.send({ type: 'event', event: ev }));
    // Always send meta with resolved values, so switching to a conversation
    // without saved metadata properly resets title/color (it doesn't carry
    // over from the previously-loaded conversation).
    const meta = this.store.getSessionMeta(this.backend.id, sessionId);
    const title = meta?.title || `Conversation ${sessionId.slice(0, 8)}`;
    const color = meta?.color || '#007acc';
    this.send({ type: 'meta', title, color });
    this.panel.title = title;
  }

  private async handleResume(sessionId: string, useTmux: boolean): Promise<void> {
    try {
      this.send({ type: 'banner', message: null });
      await this.backend.resumeSession(sessionId, useTmux);
      this.currentSessionId = sessionId;
      await this.loadSession(sessionId);
      this.send({ type: 'inputEnabled', enabled: true });
    } catch (e) {
      this.send({ type: 'banner', message: `Resume failed: ${(e as Error).message}` });
    }
  }

  private async handleNew(prompt: string, useTmux: boolean): Promise<void> {
    if (!this.currentProjectId) {
      this.send({ type: 'banner', message: 'No project selected.' });
      return;
    }
    this.send({ type: 'banner', message: null });
    try {
      const { sessionId } = await this.backend.spawnNewSession({ projectId: this.currentProjectId, initialPrompt: prompt, useTmux });
      this.currentSessionId = sessionId;
      // The session .jsonl file may not exist yet — the agent is loading
      // config / tools / showing a workspace-trust prompt etc. before it
      // writes the first line. 15s covers cold starts; in non-tmux
      // one-shot mode it's typically much faster.
      const waitFor = this.backend.sessionFilePath(this.currentProjectId, sessionId);
      const start = Date.now();
      while (!fs.existsSync(waitFor) && Date.now() - start < 15000) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!fs.existsSync(waitFor)) {
        const tmuxHint = useTmux
          ? ' If tmux is on, attach to the session (`tmux ls` to find it, then `tmux attach -t <name>`) — the agent may be waiting on a workspace-trust prompt.'
          : '';
        this.send({ type: 'banner', message: `Timed out waiting for the session file to appear.${tmuxHint}` });
        return;
      }
      // Refresh session list and load.
      const sessions = await this.listSessionsWithTitles(this.currentProjectId);
      this.send({ type: 'sessions', sessions, selectedId: sessionId });
      await this.loadSession(sessionId);
      this.send({ type: 'inputEnabled', enabled: true });
    } catch (e) {
      this.send({ type: 'banner', message: `New session failed: ${(e as Error).message}` });
    }
  }

  reveal(): void {
    this.panel.reveal();
  }

  private dispose(): void {
    this.watchSub?.dispose();
    this.onDispose?.();
  }
}
