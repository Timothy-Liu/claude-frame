import type { NormalizedEvent } from '../core/events';
import type { Project, Session } from '../backends/types';

export type HostToWebview =
  | { type: 'init'; backendDisplayName: string; capabilities: { groupByProject: boolean; supportsTmux: boolean }; tmuxAvailable: boolean }
  | { type: 'projects'; projects: Project[]; selectedId?: string }
  | { type: 'sessions'; sessions: Session[]; selectedId?: string }
  | { type: 'meta'; title?: string; color?: string }
  | { type: 'event'; event: NormalizedEvent }
  | { type: 'reset' }
  | { type: 'banner'; message: string | null }
  | { type: 'inputEnabled'; enabled: boolean }
  | { type: 'sessionId'; sessionId: string };

export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'selectProject'; projectId: string }
  | { type: 'selectSession'; sessionId: string }
  | { type: 'resume'; sessionId: string; useTmux: boolean }
  | { type: 'requestNewPrompt'; useTmux: boolean }
  | { type: 'send'; text: string }
  | { type: 'interrupt' }
  | { type: 'terminate' }
  | { type: 'renameTitle'; title: string }
  | { type: 'setColor'; color: string }
  | { type: 'copySelected'; turns: number[] }
  | { type: 'refresh' };
