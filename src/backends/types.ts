import type * as vscode from 'vscode';
import type { NormalizedEvent } from '../core/events';

export interface Project {
  id: string;       // backend-internal id (e.g., encoded cwd)
  label: string;    // human-readable (e.g., decoded cwd)
  cwd: string;      // absolute filesystem path the agent runs in
}

export interface Session {
  id: string;
  title?: string;
  lastMtime: number;
}

export interface SpawnOpts {
  projectId: string;
  initialPrompt: string;
  useTmux: boolean;
}

export interface BackendCapabilities {
  groupByProject: boolean;
  canPresetSessionId: boolean;
  supportsTmux: boolean;
  supportsInterrupt: boolean;
}

export interface AgentBackend {
  id: string;
  displayName: string;
  capabilities: BackendCapabilities;

  isAvailable(): Promise<boolean>;
  listProjects(): Promise<Project[]>;
  listSessions(projectId: string): Promise<Session[]>;
  watchSession(sessionId: string, onEvent: (e: NormalizedEvent) => void): vscode.Disposable;
  sessionFilePath(projectId: string, sessionId: string): string;

  spawnNewSession(opts: SpawnOpts): Promise<{ sessionId: string }>;
  resumeSession(sessionId: string, useTmux: boolean): Promise<void>;
  sendMessage(sessionId: string, text: string): Promise<void>;
  interrupt(sessionId: string): Promise<void>;
  teardown(sessionId: string): Promise<void>;
}
