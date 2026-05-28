// STRUCTURAL INVARIANT: each backend registration is on its own line and
// contains the literal substring of the backend's directory name. The export
// script (scripts/export.sh) strips the non-selected backend's line using a
// directory-name-based grep. Do not refactor this file into a loop, object
// literal, or other compact form without updating the export script to match.

import type { AgentBackend } from './types';
import { ClaudeCodeBackend } from './claude-code';

const registry: AgentBackend[] = [];

// REGISTRATION LINES — one backend per line, line must contain backend dir name:
registry.push(new ClaudeCodeBackend()); // claude-code

export function getRegisteredBackends(): AgentBackend[] {
  return registry;
}

export function registerBackend(b: AgentBackend): void {
  registry.push(b);
}
