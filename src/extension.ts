import * as vscode from 'vscode';
import { getRegisteredBackends } from './backends';
import { SessionMetadataStore } from './core/metadata';
import { ChatPanel } from './core/panel';

export function activate(context: vscode.ExtensionContext): void {
  const store = new SessionMetadataStore(context.globalState);
  const disposable = vscode.commands.registerCommand('claude-frame.openChat', () => {
    const backends = getRegisteredBackends();
    if (backends.length === 0) {
      vscode.window.showErrorMessage('Claude Frame: no backends registered.');
      return;
    }
    // Multi-panel is intentional: each invocation opens a new panel so the user
    // can run several agent sessions concurrently in side-by-side tabs (one of
    // v1's headline features). Do NOT add a singleton guard here.
    // For now: first backend wins. Backend picker UI is a future enhancement.
    new ChatPanel(context, backends[0], store);
  });
  context.subscriptions.push(disposable);
}

export function deactivate(): void {}
