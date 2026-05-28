# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-05-24

Initial public release.

### Added

#### Core chat experience
- VS Code editor-tab chat panel for command-line AI coding agents (currently: [Claude Code](https://docs.claude.com/en/docs/claude-code/overview)).
- Opens with `Cmd+Alt+C` (macOS) / `Ctrl+Alt+C` (Linux/Windows).
- Each invocation opens a new panel — run multiple agent sessions side by side as concurrent tabs.

#### Visual identity
- ♥ Heart icon next to the conversation title that pulses (two-thump rhythm) when the conversation is active, sits still when only browsing.
- Per-conversation accent color via the system's native color picker. Title, heart, accent highlights, and Send button all recolor together. Persists across restarts.
- Per-conversation user-editable title (double-click or pencil icon to rename). Persists across restarts. Reflected in the conversation dropdown and the editor tab title.

#### Conversation management
- Project dropdown auto-selects the matching workspace folder; falls back to last-used.
- Conversation dropdown shows the user-given title, or the full conversation ID when no title is set.
- One-click **Resume** to reconnect to a past conversation.
- **New Chat** prompts for an initial prompt via VS Code's native input box.
- Read-only browse: pick a conversation without clicking Resume — read, scroll, copy without sending.

#### Persistence
- Tmux-backed mode (default ON when tmux is installed):
  - Long-lived interactive agent inside a detached tmux session named after the conversation ID.
  - Prompt cache stays warm across turns (new tokens only).
  - Survives VS Code restarts and SSH disconnects.
- One-shot mode (when tmux is unchecked):
  - Each turn spawns a fresh non-interactive agent invocation.
  - Works without tmux at the cost of per-turn startup latency.
- Tmux checkbox is disabled when tmux isn't installed on the host.

#### Reading & navigation
- Markdown rendering with [Prism](https://prismjs.com/) syntax highlighting for `javascript`, `typescript`, `json`, `bash`, `python`.
- Group-by-turn mode pairs each user message with its assistant response in a single card (default ON).
- Align-all-left mode for a chat-log feel.
- Initial-backlog batch flush: a spinner replaces the visible per-bubble streaming during the first load, then the full conversation appears at once and scrolls to the bottom.

#### Copy
- Per-bubble Copy button. Per-code-block Copy button.
- **Copy Selected** for batch grabs across bubbles. Selection by click on any bubble (visible hover/selected outline rings).
- Output is the underlying Markdown source — no terminal-wrap line breaks, no zero-width whitespace, no trailing spaces. `bash` blocks paste straight into a shell.

#### Zen mode
- Hides the header and settings bar. The conversation area expands.
- Heart icon and title relocate into the batch bar (right-aligned next to the conversation ID, font scaled to 13px for visual consistency).
- One click to enter, one click to leave.

#### Architecture
- Pluggable `AgentBackend` interface (`src/backends/types.ts`).
- Self-contained module per backend; adding a new agent requires no changes to the UI layer.
- Single backend registry with a structural invariant supporting compile-time stripping for downstream distributions.

### Known limitations

- **Windows users need WSL for tmux.** Without tmux you can still use the extension in one-shot mode.
- **One-shot mode pays a per-turn startup cost** (~1–2 seconds) and re-ingests full conversation context when the prompt cache TTL expires (5 min on API-key billing, 1 hour on subscriptions).
- **Interactive agent prompts aren't surfaced in the webview.** Workspace-trust confirmations, numbered choices, and similar prompts appear inside the tmux pane only. Auto-permission mode minimizes this, but when it happens the agent waits indefinitely. Workaround: `tmux attach -t <conversation-id>`, respond, then `Ctrl-b d` to detach. See [USER_MANUAL_EN.md → Known Issues](USER_MANUAL_EN.md#known-issues) for the parallel-terminal pattern.
- **`publisher` field** is set to `Timothy-Liu`. If you fork to publish under a different identity, update `package.json`.

[Unreleased]: https://github.com/Timothy-Liu/claude-frame/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Timothy-Liu/claude-frame/releases/tag/v0.1.0
