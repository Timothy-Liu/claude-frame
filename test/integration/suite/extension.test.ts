import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Integration', () => {
  test('command is registered', async () => {
    const all = await vscode.commands.getCommands(true);
    assert.ok(all.includes('claude-frame.openChat'));
  });

  test('opening the panel does not throw', async () => {
    await vscode.commands.executeCommand('claude-frame.openChat');
    // Panel creation is async; give the event loop a tick.
    await new Promise((r) => setTimeout(r, 200));
  });
});
