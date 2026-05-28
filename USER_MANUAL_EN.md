# Claude Frame — User Manual

> Claude Frame is a VS Code chat panel for command-line AI coding agents.
> This document walks through every feature in detail. For a short overview, see [README.md](README.md).

## Table of Contents

- [Getting Started](#getting-started)
- [Core Concepts](#core-concepts)
- [Workflows](#workflows)
- [UI Reference](#ui-reference)
- [Tips & Tricks](#tips--tricks)
- [Known Issues](#known-issues)
- [Troubleshooting](#troubleshooting)
- [Architecture](#architecture)

---

## Getting Started

### Prerequisites
- VS Code 1.85 or later.
- An AI agent CLI installed on your `PATH`. Currently supported: [Claude Code](https://docs.claude.com/en/docs/claude-code/overview).
- **(Strongly recommended) tmux 3.0+**. Without tmux, the extension still works in one-shot mode but each user turn pays cold-start cost and the agent dies when VS Code closes.

### Install the extension
- From the Marketplace: search **Claude Frame** in the Extensions view, click Install.
- Or download the latest `.vsix` from [Releases](../../releases) and run `Extensions: Install from VSIX...` in VS Code.

### Your first chat
1. Open the project folder you want to work in.
2. Press `Cmd+Alt+C` (macOS) or `Ctrl+Alt+C` (Linux/Windows). A chat panel opens as an editor tab.
3. The **Project** dropdown auto-selects your workspace folder. The **Conversation** dropdown lists any past conversations in that project (empty on first use).
4. Click **New Chat**. Enter your initial prompt in the popup. Press Enter.
5. The conversation panel resets, a loading spinner shows briefly, and the agent's response streams in. The heart icon next to the title starts beating — your agent is alive.

<!-- TODO: screenshot of New Chat dialog + first response -->

---

## Core Concepts

### Conversation
The fundamental unit. Each conversation has:
- A unique ID (UUID).
- A `.jsonl` log on disk capturing every turn — managed by the agent CLI itself, not the extension.
- An optional user-given **title** and **accent color**, persisted by the extension across restarts.

The conversation ID is the single source of truth: title, color, tmux session name (when applicable), and the on-disk log file are all keyed by it.

### Project
A directory the agent runs in. The extension groups conversations by their working directory so you see only the conversations relevant to your current folder.

The **Project** dropdown lists every directory that has ever hosted a conversation. On panel open, the matching workspace folder is auto-selected when possible.

### tmux mode vs one-shot mode

The extension supports two ways of running the agent. The **Use tmux** checkbox in the toolbar selects between them.

|  | **tmux on** (recommended) | **tmux off** |
|---|---|---|
| Process model | Long-lived interactive agent inside a detached tmux session | Each user turn spawns a fresh non-interactive agent invocation |
| Per-turn cost | New tokens only (prompt cache always warm) | Mostly cached, but full re-ingestion on TTL expiry / CLI upgrade |
| Per-turn latency | Instant — process is already loaded | ~1–2 second startup overhead |
| Survives VS Code close | ✅ | ❌ agent dies with the extension host |
| When to use | Default. Anything ongoing. | Quick read-only browse; machines without tmux |

See [the README's tmux section](README.md#-why-tmux-makes-everything-better) for the full reasoning.

### The heartbeat ♥
A small heart sits to the left of the conversation title. When the conversation is active — you've just clicked **Resume**, or just used **New Chat** — it pulses with a steady two-thump rhythm. When you're only browsing past history without resuming, it stays still. A glance tells you whether the agent process is alive.

### Per-conversation branding
- **Title** — double-click the title text, or click the ✏️ pencil icon, to enter edit mode. Press Enter or click away to save. Persists across restarts. Reflected in the conversation dropdown and the editor tab title.
- **Accent color** — click the 🎨 palette icon to open the system's native color picker. Pick any color. The title text, the heart, the accent highlights, and the send button all recolor immediately. Persists per-conversation.

### Backend
The extension's UI doesn't know about any specific agent's protocol. It talks to a small `AgentBackend` interface; the default backend wraps Claude Code. The backend is responsible for spawning the agent, watching its conversation log for events, and routing user input back. See [Architecture](#architecture).

---

## Workflows

### Start a new chat
1. Press `Cmd+Alt+C` (or focus an open panel).
2. Confirm **Use tmux** is checked (default ON when tmux is installed).
3. Click **New Chat**. Type your initial prompt in the VS Code input dialog. Press Enter.
4. The panel resets, briefly shows a loading spinner, then streams the agent's response. The heart starts beating.

### Resume an existing conversation
1. From the **Conversation** dropdown, pick a past conversation. The history loads (read-only).
2. Click **Resume**. The agent process spins up (or attaches to an existing tmux session). The heart starts beating. The input area becomes editable.
3. Type your next message and press Enter.

### Browse without resuming
1. From the **Conversation** dropdown, pick a past conversation. The history loads.
2. Do NOT click Resume. The heart stays still; the input remains read-only. You can read, scroll, select bubbles, and copy turns — but you can't send new messages.

### Switch between several active conversations
- Each `Cmd+Alt+C` opens a brand-new panel. Run as many as you want in parallel editor tabs.
- Use distinct accent colors and titles to tell them apart at a glance.

### Rename or recolor a conversation
- Title: double-click the title text, type, press Enter.
- Color: click the 🎨 palette icon, pick a color from the native picker.
- Both immediately save and apply across the panel.

### Enter / leave Zen mode
- Click `▲ Zen Mode` in the batch bar (or the keyboard binding if you set one).
- The header and settings bar disappear. The heart and title slide into the right side of the batch bar (smaller font, matching the surrounding 13px).
- The conversation area expands to fill the screen.
- Click `▼ Exit Zen` to restore.

---

## UI Reference

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ♥  My Refactor Session   ✏️  🎨                                        │  ← Header
├─────────────────────────────────────────────────────────────────────────┤
│  Project: /home/me/repo ▾    Conversation: My Refactor ▾    Refresh    │
│                              Resume   New Chat   ☑ Use tmux            │
├─────────────────────────────────────────────────────────────────────────┤
│  ☐ Align all left   ☑ Group by turn                                    │  ← Settings bar
├─────────────────────────────────────────────────────────────────────────┤
│  ▲ Zen   Select All   Clear   Copy Selected (0)        abc-1234 📋 ID │  ← Batch bar
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                                                  👤 You                 │
│                              Refactor handleResume to use the new API.  │
│                                                                         │
│   🤖 Assistant                                                         │
│   I'll start by reading the current implementation in panel.ts...      │
│   ```typescript                                                         │
│   private async handleResume(...) { ... }                              │
│   ```                                                                   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ───── (drag to resize) ─────                                           │
│  Type your message here (Enter to send, Shift+Enter for newline)        │
│                                                                  [Send] │
└─────────────────────────────────────────────────────────────────────────┘
```

### Header
- **♥ Heart icon** — pulses when the conversation is active, still when idle. Inherits the accent color.
- **Title** — accent-colored bold text. Double-click or click the ✏️ pencil to rename.
- **✏️ Pencil** — alternate trigger for rename mode.
- **🎨 Palette** — opens the system's native color picker. Pick any color.

### Toolbar
- **Project dropdown** — switch between project folders that have past conversations. The current workspace folder is preselected when possible.
- **Conversation dropdown** — pick a past conversation in the current project. Shows the title if set, otherwise the full conversation ID.
- **Refresh** — re-scan project + conversation lists from disk. Use after the agent finishes a task that may have created new conversations.
- **Resume** — connect to the selected conversation as an active session.
- **New Chat** — start a fresh conversation. Opens an input dialog for the initial prompt.
- **Use tmux** — enable the long-lived tmux-backed agent. Default ON when tmux is installed; the checkbox is disabled when it isn't.

### Settings bar
- **Align all left** — instead of right-aligning your messages chat-bubble-style, lay everything left for a chat-log feel.
- **Group by turn** — pair each user message with its assistant response in a single bordered card.

### Batch bar
- **Zen toggle** (`▲ Zen Mode` / `▼ Exit Zen`) — hide / show the header + settings bar.
- **Select All** / **Clear Selection** — bulk-select all visible turns.
- **Copy Selected (N)** — copy all selected turns to clipboard as clean Markdown (not terminal scrollback). Count updates live.
- **Conversation ID + 📋 Copy ID** — appears when a conversation is loaded. Click to copy the full UUID.

### Conversation area
- Each turn is a bubble. Hover to see a dashed accent outline. Click anywhere on the bubble (except buttons) to toggle selection (solid outline ring).
- Code blocks are syntax-highlighted (Prism). Each block has its own **Copy** button. The copied text is the underlying Markdown source — no terminal-wrap line breaks, no zero-width whitespace, no trailing spaces. A `bash` block's command pastes straight into a shell and runs.
- Long conversations scroll naturally. New messages auto-scroll to the bottom.
- A thinking indicator with the accent-colored spinner appears immediately after Send and disappears when the agent's response arrives.

### Composer
- **Textarea** — Enter sends. Shift+Enter inserts a newline.
- **Splitter** — drag the thin bar above the textarea up or down to resize the input area (clamped between 40px and 60% of the viewport).
- **Send button** — semi-transparent until hovered. Disabled while a response is in flight.

### Zen mode
Hides the header and settings bar. The conversation area expands. The heart and title relocate to the right side of the batch bar — smaller (13px to match the surrounding text), but still right next to the conversation ID. You retain identity at a glance without sacrificing screen real estate.

---

## Tips & Tricks

### Color-code parallel work
Open 3–5 conversations at once across tabs. Give each a distinct accent color: red for the urgent bug, green for a feature, purple for an experiment. The visual distinction makes alt-tabbing through tabs effortless.

### Names that survive your memory
Rename a conversation to something meaningful before stepping away ("Fix payment retry flow"). When you come back two days later, the dropdown reads like a TODO list, not a wall of UUIDs.

### Use tmux. Really.
The cost and latency differences are real and compound across a workday. See the [README's tmux section](README.md#-why-tmux-makes-everything-better).

### Reload the UI without killing the agent
`Developer: Reload Window` (or `Cmd+R` in the dev host) reloads the webview without touching tmux. Useful while iterating on extension changes — your agent state stays alive.

### Copy is paste-ready
A subtle but real productivity win: copying a code block from a terminal-rendered agent UI usually picks up the terminal's wrapped lines, ANSI color codes, and trailing whitespace, so commands need cleaning before they run. Copying from Claude Frame hands you the underlying Markdown source — a `bash` block's command runs the instant you paste it into a shell.

### Use Zen mode for long reads
When reviewing a long conversation, Zen mode reclaims the header height for content. You still see the heart and title in the batch row, so you don't lose context.

---

## Known Issues

### The agent gets stuck on an interactive prompt

The extension launches the agent in **auto-permission mode**, which lets the agent self-decide most actions without asking. But a small number of interactions still surface as **interactive prompts inside the agent's pane** that the webview can't render or respond to:

- Workspace-trust confirmation on first use of a directory
- Numbered choices ("Choose: 1) … 2) … 3) …")
- Slash commands that open their own UI
- Anything the agent's permission policy still escalates

Symptom: the heartbeat keeps pulsing, the **Thinking** spinner runs forever, and no new turn arrives.

**Unblock by attaching to the agent's tmux session and responding there**:

```bash
tmux ls                                                # find the session (named by conversation ID)
tmux attach -t <your-conversation-id>                  # see the prompt + answer
# When done, detach (don't kill): Ctrl-b then d
```

Once you've answered in the pane, the agent continues. The webview picks up the new turns automatically — no refresh needed.

If you're running with **Use tmux off** (one-shot mode), there's no pane to attach to. The agent exits when it hits a prompt it can't answer non-interactively. Easiest fix: turn tmux on before starting / resuming the conversation.

### Recommended habit: keep a tmux-attached terminal beside the panel

The chat panel can't render every interactive prompt the agent might pop up. The pragmatic fix is to keep a tmux-attached terminal open from the start, *beside* the panel, so any prompt is visible the moment it appears.

1. Start a conversation in the extension with **Use tmux** on.
2. Open VS Code's integrated terminal (`` Ctrl + ` ``).
3. **Move the terminal to the right side** so it sits beside the chat panel — drag the terminal's tab into the right edge of the editor area, or run `Terminal: Move Terminal into Editor Area` from the command palette and then drag the tab. Now the chat panel and the live agent view are visible at the same time.
4. `tmux attach -t <your-conversation-id>` to enter the live agent session. Detach with `Ctrl-b d` when done (don't `Ctrl-d` — that kills the session).
5. Glance at the terminal as you work. Any prompt the webview can't render shows up there; answer it directly in the pane. The agent continues, and the webview picks up the new turns automatically.

The webview keeps streaming the conversation independently — both views read the same `.jsonl` file.

> **Caveat**: don't send messages from the chat panel and the terminal at the same time. Per Anthropic's docs, two concurrent prompts to the same session interleave in the transcript — functional but confusing.

If you skip the attach upfront and the agent appears to hang (heartbeat pulsing, Thinking spinner never resolves), the same `tmux attach -t <id>` lets you peek at what's pending and respond.

---

## Troubleshooting

### "AI agent CLI not found on PATH"
A banner appears in the panel header. The expected CLI binary isn't reachable. Install it (see [Quick Start in the README](README.md#-quick-start)) and either reopen the panel or click **Refresh**.

### Send button does nothing / thinking spinner runs forever
1. Verify the agent CLI works from a terminal: e.g. `claude --version`.
2. If using tmux: check `tmux ls` for a session whose name matches the conversation ID.
3. If using tmux-off mode: the agent runs fresh per turn. Try the equivalent invocation manually in a terminal to see error output.

### Tmux session won't terminate
- Specific session: `tmux kill-session -t <conversation-id>`.
- All sessions: `tmux kill-server`.

### Conversation disappeared from the dropdown
The extension lists `.jsonl` files in the current project's session storage directory. If the file was moved or deleted, the conversation disappears. Check the agent's session storage location (commonly under `~/.claude/projects/<encoded-cwd>/`).

### Webview doesn't refresh after I renamed something
Right-click the panel tab and choose `Reload Webview`. Or `Developer: Reload Window` to reset everything.

### "Cannot resume: session not found on disk"
The conversation ID in the dropdown doesn't match any file on disk. This shouldn't normally happen — click **Refresh** to re-scan.

---

## Architecture

The extension is built around a small backend interface:

```typescript
interface AgentBackend {
  id: string;
  displayName: string;
  capabilities: { groupByProject; canPresetSessionId; supportsTmux; supportsInterrupt };

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
```

The UI never knows about a specific agent's protocol. It just renders `NormalizedEvent`s (`user` / `assistant` / `error`) and posts user input through the interface. Each backend is a self-contained module under `src/backends/`. Adding a new agent is largely additive — no changes to the UI layer.

Pull requests welcome. Open an issue first to discuss the agent you want to add.

---

中文版:[USER_MANUAL_CN.md](USER_MANUAL_CN.md)  ·  README:[README.md](README.md) / [README_CN.md](README_CN.md)
