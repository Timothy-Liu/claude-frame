import type * as vscode from 'vscode';

export interface SessionMeta {
  title?: string;
  /** Accent color stored as a CSS color string (e.g. `#007acc`). */
  color?: string;
}

export function sessionMetaKey(backendId: string, sessionId: string): string {
  return `meta-${backendId}-${sessionId}`;
}

export function lastProjectKey(backendId: string): string {
  return `last-project-${backendId}`;
}

export class SessionMetadataStore {
  constructor(private memento: vscode.Memento) {}

  getSessionMeta(backendId: string, sessionId: string): SessionMeta | undefined {
    return this.memento.get<SessionMeta>(sessionMetaKey(backendId, sessionId));
  }

  async setSessionMeta(backendId: string, sessionId: string, meta: SessionMeta): Promise<void> {
    await this.memento.update(sessionMetaKey(backendId, sessionId), meta);
  }

  getLastProject(backendId: string): string | undefined {
    return this.memento.get<string>(lastProjectKey(backendId));
  }

  async setLastProject(backendId: string, projectId: string): Promise<void> {
    await this.memento.update(lastProjectKey(backendId), projectId);
  }
}
