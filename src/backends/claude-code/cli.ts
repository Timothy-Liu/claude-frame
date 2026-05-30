import { randomUUID } from 'crypto';

/**
 * Default permission mode for every claude invocation we spawn.
 *
 * Why `auto`: the webview UI has no way to surface or respond to claude's
 * interactive permission prompts (numbered choices, y/n confirms, etc.).
 * Without `--permission-mode auto`, the agent can deadlock inside the
 * tmux pane waiting for a key press the user can't see. `auto` lets
 * claude decide most actions automatically (matching the experience a
 * user gets in a normal terminal with auto mode enabled) while keeping
 * the safety net for genuinely high-risk operations.
 */
const PERMISSION_MODE = 'auto';

export function generateSessionId(): string {
  return randomUUID();
}

/** Interactive (tmux pane) argv for a brand new claude session. */
export function newSessionArgv(sessionId: string, initialPrompt: string): string[] {
  return ['claude', '--permission-mode', PERMISSION_MODE, '--session-id', sessionId, initialPrompt];
}

/** Interactive (tmux pane) argv for resuming an existing session. */
export function resumeArgv(sessionId: string): string[] {
  return ['claude', '--permission-mode', PERMISSION_MODE, '--resume', sessionId];
}

/** One-shot non-interactive argv for a brand new session (no-tmux path). */
export function printNewArgv(sessionId: string, initialPrompt: string): string[] {
  return ['claude', '--print', '--permission-mode', PERMISSION_MODE, '--session-id', sessionId, initialPrompt];
}

/** One-shot non-interactive argv for a single turn against an existing session. */
export function printResumeArgv(sessionId: string, text: string): string[] {
  return ['claude', '--print', '--permission-mode', PERMISSION_MODE, '--resume', sessionId, text];
}

/** Tmux session name — the bare conversation ID. Same identifier the UI exposes via "Copy ID". */
export function tmuxName(sessionId: string): string {
  return sessionId;
}
