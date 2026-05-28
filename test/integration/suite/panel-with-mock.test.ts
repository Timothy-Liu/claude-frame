import * as assert from 'assert';
import * as vscode from 'vscode';
import { ChatPanel } from '../../../src/core/panel';
import { SessionMetadataStore } from '../../../src/core/metadata';
import type { AgentBackend, Project, Session, SpawnOpts } from '../../../src/backends/types';
import type { NormalizedEvent } from '../../../src/core/events';

class MockBackend implements AgentBackend {
  id = 'mock';
  displayName = 'Mock';
  capabilities = { groupByProject: false, canPresetSessionId: true, supportsTmux: false, supportsInterrupt: false };
  events: ((e: NormalizedEvent) => void) | undefined;

  async isAvailable(): Promise<boolean> { return true; }
  async listProjects(): Promise<Project[]> { return [{ id: 'p1', label: 'mock-project', cwd: '/tmp' }]; }
  async listSessions(_: string): Promise<Session[]> { return [{ id: 's1', lastMtime: Date.now() }]; }
  watchSession(_: string, onEvent: (e: NormalizedEvent) => void): vscode.Disposable {
    this.events = onEvent;
    return { dispose: () => { this.events = undefined; } };
  }
  sessionFilePath(_p: string, sessionId: string): string { return `/tmp/${sessionId}.jsonl`; }
  async spawnNewSession(_: SpawnOpts): Promise<{ sessionId: string }> { return { sessionId: 's-new' }; }
  async resumeSession(): Promise<void> {}
  async sendMessage(): Promise<void> {}
  async interrupt(): Promise<void> {}
  async teardown(): Promise<void> {}

  emit(e: NormalizedEvent): void { this.events?.(e); }
}

suite('ChatPanel with mock backend', () => {
  test('panel accepts user + assistant events without throwing', async function() {
    this.timeout(5000);
    // Use a minimal context stub matching what ChatPanel needs.
    const context = {
      extensionPath: process.cwd(),
      extensionUri: vscode.Uri.file(process.cwd()),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      globalState: { get: () => undefined, update: async () => {}, keys: () => [], setKeysForSync: () => {} } as any,
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;
    const store = new SessionMetadataStore(context.globalState);
    const backend = new MockBackend();
    const panel = new ChatPanel(context, backend, store);
    // Give the panel a tick to set up, then emit events.
    await new Promise((r) => setTimeout(r, 200));
    backend.emit({ kind: 'user', text: 'hello', ts: Date.now() });
    backend.emit({ kind: 'assistant', markdown: 'hi there', ts: Date.now() });
    await new Promise((r) => setTimeout(r, 200));
    // Test passes if no exception was thrown. Verifying DOM in webview from here
    // is not straightforward; the wiring not crashing is the minimum signal.
    assert.ok(true);
    // Suppress unused-variable warning — panel is used for side effects above.
    void panel;
  });
});
