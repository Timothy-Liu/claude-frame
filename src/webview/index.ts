import type { HostToWebview, WebviewToHost } from './messages';
import type { NormalizedEvent } from '../core/events';
// @ts-expect-error — marked is bundled by esbuild
import { marked } from 'marked';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-python';

declare function acquireVsCodeApi(): { postMessage(msg: WebviewToHost): void };
const vscode = acquireVsCodeApi();

// ── Marked + Prism configuration ────────────────────────────────────────────
marked.setOptions({
  // @ts-expect-error — highlight is a marked v3 option still accepted
  highlight(code: string, lang: string) {
    if (lang && Prism.languages[lang]) {
      return Prism.highlight(code, Prism.languages[lang], lang);
    }
    return code;
  },
  breaks: true,
});

// ── State ────────────────────────────────────────────────────────────────────
interface DialogueEntry { sender: 'User' | 'Assistant'; rawText: string; }
interface Turn { user: DialogueEntry | null; assistant: DialogueEntry | null; }

let backendDisplayName = 'Assistant';
let activeSessionId: string | null = null;
let groupByTurn = true;
let alignAllLeft = false;
let dialoguesList: DialogueEntry[] = [];
let turnsList: Turn[] = [];
let inputEnabled = false;
let supportsGroupByProject = false;
let tmuxAvailable = false;

// Initial-load gate: while true, incoming events are accumulated in
// dialoguesList but not rendered. When the JSONL backlog stops arriving
// for LOAD_SETTLE_MS, flushLoad() does a single batch render + scroll to
// bottom. This avoids the one-bubble-at-a-time scroll jitter.
let isLoading = false;
let loadDebounceTimer: number | null = null;
const LOAD_SETTLE_MS = 250;

// ── DOM references ───────────────────────────────────────────────────────────
const msgContainer   = document.getElementById('message-container') as HTMLElement;
const emptyState     = document.getElementById('empty-state') as HTMLElement;
const errorBanner    = document.getElementById('error-banner') as HTMLElement;
const errorMessage   = document.getElementById('error-message') as HTMLElement;
const errorCloseBtn  = document.getElementById('error-close-btn') as HTMLElement;
const heartEl        = document.getElementById('heart-icon') as HTMLElement;
const chatTitleEl    = document.getElementById('chat-title-text') as HTMLElement;
const editIconBtn    = document.getElementById('edit-icon-btn') as HTMLElement;
const paletteBtn     = document.getElementById('palette-icon-btn') as HTMLElement;
const swatchPopup    = document.getElementById('color-swatch-popup') as HTMLElement;
const projectSel     = document.getElementById('project-selector') as HTMLSelectElement;
const sessionSel     = document.getElementById('session-selector') as HTMLSelectElement;
const refreshBtn     = document.getElementById('refresh-btn') as HTMLButtonElement;
const resumeBtn      = document.getElementById('resume-btn') as HTMLButtonElement;
const newBtn         = document.getElementById('new-btn') as HTMLButtonElement;
const alignLeftCb    = document.getElementById('align-left-checkbox') as HTMLInputElement;
const groupTurnCb    = document.getElementById('group-turn-checkbox') as HTMLInputElement;
const tmuxLabel      = document.getElementById('tmux-label') as HTMLElement;
const tmuxCheckbox   = document.getElementById('tmux-checkbox') as HTMLInputElement;
const zenToggleBtn   = document.getElementById('zen-toggle-btn') as HTMLButtonElement;
const selectAllBtn   = document.getElementById('select-all-btn') as HTMLButtonElement;
const clearSelBtn    = document.getElementById('clear-selection-btn') as HTMLButtonElement;
const copySelBtn     = document.getElementById('copy-selected-btn') as HTMLButtonElement;
const selectedCount  = document.getElementById('selected-count') as HTMLElement;
const sessionIdBadge = document.getElementById('session-id-badge') as HTMLElement;
const sessionIdText  = document.getElementById('active-session-id-text') as HTMLElement;
const copySessionBtn = document.getElementById('copy-session-id-btn') as HTMLButtonElement;
const resizer        = document.getElementById('resizer') as HTMLElement;
const inputArea      = document.getElementById('input-area') as HTMLElement;
const promptInput    = document.getElementById('prompt-input') as HTMLTextAreaElement;
const sendBtn        = document.getElementById('send-btn') as HTMLButtonElement;
const inputToggleBtn = document.getElementById('input-toggle-btn') as HTMLButtonElement;

function post(msg: WebviewToHost) { vscode.postMessage(msg); }

// ── Error banner ─────────────────────────────────────────────────────────────
function showError(msg: string) {
  errorMessage.textContent = msg;
  errorBanner.classList.add('active');
}
function hideError() {
  errorBanner.classList.remove('active');
}
errorCloseBtn.addEventListener('click', hideError);

// ── Accent colour ─────────────────────────────────────────────────────────────
function applyColor(color: string) {
  document.documentElement.style.setProperty('--cc-accent-color', color);
  // Mark the matching swatch (if any) so the user sees which swatch is active
  // when they next open the popup.
  const norm = color.toLowerCase();
  swatchPopup.querySelectorAll<HTMLElement>('.color-swatch').forEach((sw) => {
    sw.classList.toggle('selected', sw.dataset.color?.toLowerCase() === norm);
  });
}

// Toggle the swatch popup when clicking the palette icon. Clicking a swatch
// inside the popup is handled separately and stops propagation so it doesn't
// re-trigger this toggle.
paletteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  swatchPopup.classList.toggle('open');
});

swatchPopup.querySelectorAll<HTMLElement>('.color-swatch').forEach((sw) => {
  sw.addEventListener('click', (e) => {
    e.stopPropagation();
    const hex = sw.dataset.color;
    if (!hex) return;
    applyColor(hex);
    post({ type: 'setColor', color: hex });
    swatchPopup.classList.remove('open');
  });
});

// Click anywhere else → close the popup.
document.addEventListener('click', () => {
  swatchPopup.classList.remove('open');
});

// ── Title editing ─────────────────────────────────────────────────────────────
editIconBtn.addEventListener('click', () => {
  chatTitleEl.contentEditable = 'true';
  chatTitleEl.focus();
});

chatTitleEl.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter') { e.preventDefault(); chatTitleEl.blur(); }
});

chatTitleEl.addEventListener('blur', () => {
  chatTitleEl.contentEditable = 'false';
  const title = chatTitleEl.textContent?.trim() ?? '';
  post({ type: 'renameTitle', title });
  // Reflect the rename in the conversation dropdown's currently-selected
  // option so the user sees the new title there too. (Host doesn't push a
  // refresh, and waiting for a round-trip would lag the UI.)
  if (activeSessionId) {
    const opt = Array.from(sessionSel.options).find((o) => o.value === activeSessionId);
    if (opt) opt.textContent = title || activeSessionId;
  }
});

chatTitleEl.addEventListener('dblclick', () => {
  chatTitleEl.contentEditable = 'true';
  chatTitleEl.focus();
});

// ── Project / session dropdowns ───────────────────────────────────────────────
projectSel.addEventListener('change', () => {
  post({ type: 'selectProject', projectId: projectSel.value });
});
sessionSel.addEventListener('change', () => {
  post({ type: 'selectSession', sessionId: sessionSel.value });
});

// ── Toolbar buttons ───────────────────────────────────────────────────────────
refreshBtn.addEventListener('click', () => post({ type: 'refresh' }));

resumeBtn.addEventListener('click', () => {
  const sid = sessionSel.value;
  if (sid) post({ type: 'resume', sessionId: sid, useTmux: tmuxCheckbox.checked });
});

newBtn.addEventListener('click', () => {
  post({ type: 'requestNewPrompt', useTmux: tmuxCheckbox.checked });
});

// ── Settings bar ─────────────────────────────────────────────────────────────
alignLeftCb.addEventListener('change', () => {
  alignAllLeft = alignLeftCb.checked;
  if (alignAllLeft) { msgContainer.classList.add('align-left-mode'); }
  else { msgContainer.classList.remove('align-left-mode'); }
});

groupTurnCb.addEventListener('change', () => {
  groupByTurn = groupTurnCb.checked;
  rerender();
});

// ── Zen mode ──────────────────────────────────────────────────────────────────
// Zen mode hides the header + settings-bar. To preserve a sense of identity
// (which conversation am I in, what color is it, is it active?), reparent the
// heart icon and the title text into the batch-bar — right before the
// conversation-id badge — for the duration of zen mode, then move them back
// when zen exits.
const batchBar = document.querySelector('.batch-bar') as HTMLElement;
const titleRow = document.querySelector('.title-row') as HTMLElement;

zenToggleBtn.addEventListener('click', () => {
  const enteringZen = !document.body.classList.contains('zen-active');
  document.body.classList.toggle('zen-active', enteringZen);
  zenToggleBtn.innerHTML = enteringZen ? '▼ Exit Zen' : '▲ Zen Mode';

  if (enteringZen) {
    batchBar.insertBefore(chatTitleEl, sessionIdBadge);
    batchBar.insertBefore(heartEl, chatTitleEl);
  } else {
    titleRow.insertBefore(chatTitleEl, editIconBtn);
    titleRow.insertBefore(heartEl, chatTitleEl);
  }
});

// ── Batch actions ─────────────────────────────────────────────────────────────
selectAllBtn.addEventListener('click', () => doSelectAll(true));
clearSelBtn.addEventListener('click', () => doSelectAll(false));
copySelBtn.addEventListener('click', () => doCopySelected());

function doSelectAll(checked: boolean) {
  document.querySelectorAll<HTMLInputElement>('.checkbox-container input[type="checkbox"]').forEach((cb) => {
    cb.checked = checked;
    const item = cb.closest('.message-item') as HTMLElement | null;
    if (item) item.classList.toggle('selected', checked);
  });
  updateSelectedCount();
}

function updateSelectedCount() {
  const n = document.querySelectorAll('.checkbox-container input[type="checkbox"]:checked').length;
  selectedCount.textContent = String(n);
}

function doCopySelected() {
  const checked = document.querySelectorAll<HTMLInputElement>('.checkbox-container input[type="checkbox"]:checked');
  if (checked.length === 0) { showError('No items selected to copy.'); return; }

  let combined = '';
  if (groupByTurn) {
    checked.forEach((cb, idx) => {
      const turnIdx = parseInt(cb.dataset.turnIdx ?? '0', 10);
      const turn = turnsList[turnIdx];
      if (!turn) return;
      let text = '';
      if (turn.user) text += `User: ${turn.user.rawText}`;
      if (turn.user && turn.assistant) text += '\n\n';
      if (turn.assistant) text += turn.assistant.rawText;
      if (idx > 0) combined += '\n\n====================\n\n';
      combined += text;
    });
  } else {
    checked.forEach((cb, idx) => {
      const msgIdx = parseInt(cb.dataset.msgIdx ?? '0', 10);
      const item = dialoguesList[msgIdx];
      if (!item) return;
      const prefix = item.sender === 'User' ? 'User: ' : `${backendDisplayName}: `;
      if (idx > 0) combined += '\n\n---\n\n';
      combined += prefix + item.rawText;
    });
  }

  navigator.clipboard.writeText(combined).catch(() => {
    showError('Failed to copy to clipboard.');
  });
}

// ── Session ID badge ──────────────────────────────────────────────────────────
copySessionBtn.addEventListener('click', () => {
  if (activeSessionId) {
    navigator.clipboard.writeText(activeSessionId).catch(() => {
      showError('Failed to copy conversation ID.');
    });
  }
});

function updateSessionBadge(id: string | null) {
  if (id) {
    activeSessionId = id;
    sessionIdText.textContent = id;
    (sessionIdBadge as HTMLElement).style.display = 'flex';
  } else {
    (sessionIdBadge as HTMLElement).style.display = 'none';
  }
}

// ── Chat state (active / readonly) ───────────────────────────────────────────
function setChatState(enabled: boolean) {
  inputEnabled = enabled;
  heartEl.classList.toggle('beating', enabled);
  if (enabled) {
    promptInput.removeAttribute('readonly');
    sendBtn.disabled = false;
    promptInput.placeholder = 'Type your message here (Enter to send, Shift+Enter for newline)...';
    promptInput.focus();
    resumeBtn.disabled = true;
    resumeBtn.textContent = 'Active Conversation';
    resumeBtn.className = 'secondary';
  } else {
    promptInput.setAttribute('readonly', 'true');
    sendBtn.disabled = true;
    promptInput.placeholder = "Select a conversation and click 'Resume', or click 'New Chat' to start chatting...";
    promptInput.value = '';
    resumeBtn.disabled = false;
    resumeBtn.textContent = 'Resume';
    resumeBtn.className = 'success';
  }
}

// Double-click readonly textarea → trigger resume
promptInput.addEventListener('dblclick', () => {
  if (promptInput.hasAttribute('readonly')) {
    const sid = sessionSel.value;
    if (sid) post({ type: 'resume', sessionId: sid, useTmux: tmuxCheckbox.checked });
  }
});
promptInput.addEventListener('focus', () => {
  if (promptInput.hasAttribute('readonly')) promptInput.blur();
});

// ── Send ──────────────────────────────────────────────────────────────────────
function sendPrompt() {
  const text = promptInput.value.trim();
  if (!text || !inputEnabled) return;

  promptInput.setAttribute('readonly', 'true');
  sendBtn.disabled = true;
  sendBtn.innerHTML = '<span class="spinner"></span> Sending...';

  appendLocalUserBubble(text);
  appendThinkingIndicator();

  post({ type: 'send', text });
  promptInput.value = '';
}

promptInput.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPrompt(); }
});
sendBtn.addEventListener('click', sendPrompt);

// ── Local user bubble (optimistic) ───────────────────────────────────────────
function appendLocalUserBubble(text: string) {
  removeEmptyState();
  const itemDiv = document.createElement('div');
  itemDiv.className = 'message-item User';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  const header = document.createElement('div');
  header.className = 'bubble-header';
  header.innerHTML = '<span>👤 User (Sending...)</span>';
  bubble.appendChild(header);

  const content = document.createElement('div');
  content.className = 'bubble-content';
  content.innerHTML = marked.parse(text) as string;
  bubble.appendChild(content);

  itemDiv.appendChild(bubble);
  msgContainer.appendChild(itemDiv);
  msgContainer.scrollTop = msgContainer.scrollHeight;
}

// ── Thinking indicator ────────────────────────────────────────────────────────
function appendThinkingIndicator() {
  const old = document.getElementById('thinking-indicator');
  if (old) old.remove();

  const itemDiv = document.createElement('div');
  itemDiv.className = 'message-item Assistant';
  itemDiv.id = 'thinking-indicator';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.style.borderLeft = '3px solid var(--vscode-textLink-foreground)';

  const header = document.createElement('div');
  header.className = 'bubble-header';
  header.innerHTML = `<span>🤖 ${escHtml(backendDisplayName)} (Thinking...)</span>`;
  bubble.appendChild(header);

  const content = document.createElement('div');
  content.className = 'bubble-content';
  content.style.display = 'flex';
  content.style.alignItems = 'center';
  content.style.gap = '12px';
  content.style.padding = '6px 0';
  content.innerHTML = `
    <span class="spinner" style="width:18px;height:18px;border-width:3px;border-top-color:var(--cc-accent-color);"></span>
    <span style="color:var(--vscode-descriptionForeground);font-style:italic;font-size:13px;">Thinking and analyzing workspace...</span>
  `;

  bubble.appendChild(content);
  itemDiv.appendChild(bubble);
  msgContainer.appendChild(itemDiv);
  msgContainer.scrollTop = msgContainer.scrollHeight;
}

function removeThinkingIndicator() {
  const indicator = document.getElementById('thinking-indicator');
  if (indicator) indicator.remove();
}

// ── Initial-load indicator + batch flush ─────────────────────────────────────
function showLoadingIndicator() {
  if (document.getElementById('loading-indicator')) return;
  const div = document.createElement('div');
  div.id = 'loading-indicator';
  div.className = 'loading-indicator';
  div.innerHTML = `
    <span class="spinner" style="width: 28px; height: 28px; border-width: 3px; border-top-color: var(--cc-accent-color);"></span>
    <p>Loading conversation…</p>
  `;
  msgContainer.appendChild(div);
}

function hideLoadingIndicator() {
  document.getElementById('loading-indicator')?.remove();
}

function enterLoadingState() {
  isLoading = true;
  if (loadDebounceTimer != null) { clearTimeout(loadDebounceTimer); loadDebounceTimer = null; }
  showLoadingIndicator();
  // Schedule an initial flush in case zero events arrive (empty session).
  scheduleLoadFlush();
}

function scheduleLoadFlush() {
  if (loadDebounceTimer != null) clearTimeout(loadDebounceTimer);
  loadDebounceTimer = window.setTimeout(flushLoad, LOAD_SETTLE_MS);
}

function flushLoad() {
  loadDebounceTimer = null;
  if (!isLoading) return;
  isLoading = false;
  hideLoadingIndicator();
  rerender(); // single batch DOM build from full dialoguesList
  // Force scroll-to-bottom AFTER rerender's own deferred scroll (50ms),
  // because rerender's atBottom heuristic doesn't fire on initial open.
  setTimeout(() => { msgContainer.scrollTop = msgContainer.scrollHeight; }, 60);
}

// ── NormalizedEvent → DialogueEntry ──────────────────────────────────────────
function eventToEntry(ev: NormalizedEvent): DialogueEntry | null {
  if (ev.kind === 'user') return { sender: 'User', rawText: ev.text };
  if (ev.kind === 'assistant') return { sender: 'Assistant', rawText: ev.markdown };
  return null;  // tool_use / thinking / error handled separately
}

// ── Rendering ─────────────────────────────────────────────────────────────────
function removeEmptyState() {
  if (emptyState.parentElement) emptyState.remove();
}

function rerender() {
  // Preserve scroll position
  const atBottom = msgContainer.scrollHeight - msgContainer.scrollTop - msgContainer.clientHeight < 80;

  // Remove all message-item nodes but keep empty-state if present
  msgContainer.querySelectorAll('.message-item').forEach((el) => el.remove());

  if (dialoguesList.length === 0) {
    if (!document.getElementById('empty-state')) msgContainer.appendChild(emptyState);
    return;
  }

  if (!document.getElementById('empty-state')) {
    // already removed by removeEmptyState
  }

  if (groupByTurn) {
    renderTurnGrouped();
  } else {
    renderIndividual();
  }

  Prism.highlightAll();
  if (atBottom) setTimeout(() => { msgContainer.scrollTop = msgContainer.scrollHeight; }, 50);
  updateSelectedCount();
}

function renderIndividual() {
  dialoguesList.forEach((item, idx) => {
    const itemDiv = document.createElement('div');
    itemDiv.className = `message-item ${item.sender}`;
    itemDiv.dataset.index = String(idx);

    const cbDiv = buildCheckboxDiv(idx, 'msgIdx', itemDiv);
    itemDiv.appendChild(cbDiv);

    const bubble = buildBubble();
    bubble.addEventListener('click', (e) => toggleBubbleSelection(e, cbDiv.querySelector('input')!, itemDiv));

    const header = document.createElement('div');
    header.className = 'bubble-header';

    const senderSpan = document.createElement('span');
    senderSpan.textContent = item.sender === 'User' ? '👤 User' : `🤖 ${backendDisplayName}`;
    header.appendChild(senderSpan);

    const actionsDiv = document.createElement('div');
    actionsDiv.style.display = 'flex';
    actionsDiv.style.gap = '10px';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-btn';
    copyBtn.innerHTML = '📋 Copy';
    copyBtn.onclick = (e) => { e.stopPropagation(); copyText(item.rawText); };
    actionsDiv.appendChild(copyBtn);
    header.appendChild(actionsDiv);

    bubble.appendChild(header);

    const content = document.createElement('div');
    content.className = 'bubble-content';
    content.innerHTML = marked.parse(item.rawText) as string;
    addCopyButtonsToCodeBlocks(content);
    bubble.appendChild(content);

    itemDiv.appendChild(bubble);
    msgContainer.appendChild(itemDiv);
  });
}

function renderTurnGrouped() {
  turnsList = [];
  let currentTurn: Turn | null = null;

  for (const item of dialoguesList) {
    if (item.sender === 'User') {
      if (currentTurn) turnsList.push(currentTurn);
      currentTurn = { user: item, assistant: null };
    } else {
      if (currentTurn) {
        currentTurn.assistant = item;
        turnsList.push(currentTurn);
        currentTurn = null;
      } else {
        turnsList.push({ user: null, assistant: item });
      }
    }
  }
  if (currentTurn) turnsList.push(currentTurn);

  turnsList.forEach((turn, idx) => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'message-item turn-item';
    itemDiv.dataset.turnIdx = String(idx);

    const cbDiv = buildCheckboxDiv(idx, 'turnIdx', itemDiv);
    itemDiv.appendChild(cbDiv);

    const bubble = buildBubble();
    bubble.style.width = '100%';
    bubble.style.borderLeft = '3px solid var(--vscode-button-background)';
    bubble.addEventListener('click', (e) => toggleBubbleSelection(e, cbDiv.querySelector('input')!, itemDiv));

    const header = document.createElement('div');
    header.className = 'bubble-header';

    const turnSpan = document.createElement('span');
    turnSpan.textContent = `🔄 Turn ${idx + 1}`;
    header.appendChild(turnSpan);

    const actionsDiv = document.createElement('div');
    actionsDiv.style.display = 'flex';
    actionsDiv.style.gap = '10px';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-btn';
    copyBtn.innerHTML = '📋 Copy Turn';
    copyBtn.onclick = (e) => { e.stopPropagation(); copyTurn(turn); };
    actionsDiv.appendChild(copyBtn);
    header.appendChild(actionsDiv);

    bubble.appendChild(header);

    const content = document.createElement('div');
    content.className = 'bubble-content';

    if (turn.user) {
      const userDiv = document.createElement('div');
      userDiv.style.marginBottom = turn.assistant ? '12px' : '0';
      userDiv.style.padding = '8px';
      userDiv.style.backgroundColor = 'var(--vscode-textCodeBlock-background, rgba(0, 122, 255, 0.03))';
      userDiv.style.borderRadius = '4px';

      const userHeader = document.createElement('div');
      userHeader.style.fontWeight = '600';
      userHeader.style.fontSize = '11px';
      userHeader.style.marginBottom = '4px';
      userHeader.style.color = 'var(--vscode-button-background)';
      userHeader.textContent = '👤 User Prompt';
      userDiv.appendChild(userHeader);

      const userBody = document.createElement('div');
      userBody.innerHTML = marked.parse(turn.user.rawText) as string;
      addCopyButtonsToCodeBlocks(userBody);
      userDiv.appendChild(userBody);

      content.appendChild(userDiv);
    }

    if (turn.user && turn.assistant) {
      const hr = document.createElement('hr');
      hr.style.border = 'none';
      hr.style.borderTop = '1px dashed rgba(255,255,255,0.1)';
      hr.style.margin = '12px 0';
      content.appendChild(hr);
    }

    if (turn.assistant) {
      const asstDiv = document.createElement('div');
      asstDiv.style.padding = '8px';
      asstDiv.style.backgroundColor = 'var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.02))';
      asstDiv.style.borderRadius = '4px';

      const asstHeader = document.createElement('div');
      asstHeader.style.fontWeight = '600';
      asstHeader.style.fontSize = '11px';
      asstHeader.style.marginBottom = '4px';
      asstHeader.style.color = 'var(--vscode-textLink-foreground)';
      asstHeader.textContent = `🤖 ${backendDisplayName} Response`;
      asstDiv.appendChild(asstHeader);

      const asstBody = document.createElement('div');
      asstBody.innerHTML = marked.parse(turn.assistant.rawText) as string;
      addCopyButtonsToCodeBlocks(asstBody);
      asstDiv.appendChild(asstBody);

      content.appendChild(asstDiv);
    }

    bubble.appendChild(content);
    itemDiv.appendChild(bubble);
    msgContainer.appendChild(itemDiv);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildBubble(): HTMLElement {
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  return bubble;
}

function buildCheckboxDiv(idx: number, dataKey: 'msgIdx' | 'turnIdx', itemDiv: HTMLElement): HTMLElement {
  const cbDiv = document.createElement('div');
  cbDiv.className = 'checkbox-container';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  (cb.dataset as Record<string, string>)[dataKey] = String(idx);
  cb.addEventListener('change', () => {
    itemDiv.classList.toggle('selected', cb.checked);
    updateSelectedCount();
  });
  cbDiv.appendChild(cb);
  return cbDiv;
}

function toggleBubbleSelection(e: MouseEvent, cb: HTMLInputElement, itemDiv: HTMLElement) {
  if ((e.target as Element).tagName === 'BUTTON' || (e.target as Element).closest('button') || (e.target as Element).tagName === 'A') return;
  cb.checked = !cb.checked;
  itemDiv.classList.toggle('selected', cb.checked);
  updateSelectedCount();
}

function addCopyButtonsToCodeBlocks(el: HTMLElement) {
  el.querySelectorAll<HTMLElement>('pre').forEach((pre) => {
    const code = pre.querySelector('code');
    if (!code) return;
    const btn = document.createElement('button');
    btn.className = 'code-copy-btn';
    btn.textContent = 'Copy';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyText(code.innerText);
    });
    pre.appendChild(btn);
  });
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    showError('Failed to copy to clipboard.');
  });
}

function copyTurn(turn: Turn) {
  let text = '';
  if (turn.user) text += `User: ${turn.user.rawText}`;
  if (turn.user && turn.assistant) text += '\n\n';
  if (turn.assistant) text += turn.assistant.rawText;
  copyText(text);
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Input area toggle ─────────────────────────────────────────────────────────
// Use case: when the user prefers typing into a tmux-attached terminal beside
// the panel (see "Recommended habit" in USER_MANUAL), the in-extension input
// area is dead weight. Hiding it reclaims the screen for chat history.
inputToggleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const hidden = inputArea.classList.toggle('input-hidden');
  resizer.classList.toggle('input-hidden', hidden);
  inputToggleBtn.innerHTML = hidden ? '▲ Show' : '▼ Hide';
  inputToggleBtn.title = hidden ? 'Show input area' : 'Hide input area';
});
// Prevent the button's mousedown from initiating the resizer's drag.
inputToggleBtn.addEventListener('mousedown', (e) => e.stopPropagation());

// ── Resizer drag ──────────────────────────────────────────────────────────────
let isDragging = false;
let startY = 0;
let startHeight = 0;

resizer.addEventListener('mousedown', (e) => {
  // No-op when the input area is hidden — there's nothing to resize.
  if (inputArea.classList.contains('input-hidden')) return;
  isDragging = true;
  resizer.classList.add('active');
  startY = e.clientY;
  startHeight = parseInt(window.getComputedStyle(inputArea).height, 10);
  e.preventDefault();
  document.documentElement.addEventListener('mousemove', doDrag);
  document.documentElement.addEventListener('mouseup', stopDrag);
});

function doDrag(e: MouseEvent) {
  if (!isDragging) return;
  const delta = startY - e.clientY;
  let newHeight = startHeight + delta;
  if (newHeight < 80) newHeight = 80;
  if (newHeight > window.innerHeight * 0.5) newHeight = window.innerHeight * 0.5;
  inputArea.style.height = `${newHeight}px`;
}

function stopDrag() {
  isDragging = false;
  resizer.classList.remove('active');
  document.documentElement.removeEventListener('mousemove', doDrag);
  document.documentElement.removeEventListener('mouseup', stopDrag);
}

// ── Host → Webview message handler ───────────────────────────────────────────
window.addEventListener('message', (e: MessageEvent<HostToWebview>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init': {
      backendDisplayName = msg.backendDisplayName;
      tmuxAvailable = msg.tmuxAvailable;
      supportsGroupByProject = msg.capabilities.groupByProject;
      projectSel.style.display = supportsGroupByProject ? '' : 'none';
      (projectSel.previousElementSibling as HTMLElement | null)?.style &&
        ((projectSel.previousElementSibling as HTMLElement).style.display = supportsGroupByProject ? '' : 'none');
      if (msg.capabilities.supportsTmux) {
        tmuxLabel.style.display = '';
        // Checkbox is enabled only when tmux is installed on the machine.
        // Default to CHECKED when tmux is available: the tmux path keeps a
        // long-lived interactive agent process, which means each turn pays
        // only for the new tokens (prompt cache stays warm) and avoids the
        // per-turn one-shot startup cost. Users can uncheck if they explicitly
        // want the non-tmux one-shot path.
        tmuxCheckbox.disabled = !tmuxAvailable;
        tmuxCheckbox.checked = tmuxAvailable;
      } else {
        tmuxLabel.style.display = 'none';
      }
      break;
    }
    case 'projects': {
      projectSel.innerHTML = '';
      if (msg.projects.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = 'No projects found';
        projectSel.appendChild(opt);
        break;
      }
      msg.projects.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.label;
        if (p.id === msg.selectedId) opt.selected = true;
        projectSel.appendChild(opt);
      });
      break;
    }
    case 'sessions': {
      sessionSel.innerHTML = '';
      if (msg.sessions.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = 'No conversations found';
        sessionSel.appendChild(opt);
        break;
      }
      msg.sessions.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.id;
        // No title → show the full conversation ID so it matches the badge.
        opt.textContent = s.title ?? s.id;
        if (s.id === msg.selectedId) opt.selected = true;
        sessionSel.appendChild(opt);
      });
      break;
    }
    case 'meta': {
      if (msg.title) {
        chatTitleEl.textContent = msg.title;
        chatTitleEl.contentEditable = 'false';
      }
      if (msg.color) applyColor(msg.color);
      break;
    }
    case 'event': {
      const ev = msg.event;
      if (ev.kind === 'error') {
        showError(ev.message);
        break;
      }
      if (ev.kind === 'tool_use' || ev.kind === 'thinking') break;

      // Remove thinking indicator on first real event after send
      removeThinkingIndicator();

      const entry = eventToEntry(ev);
      if (entry) {
        dialoguesList.push(entry);
        if (isLoading) {
          // Defer DOM work to flushLoad — extend the debounce window so the
          // backlog keeps coalescing as more lines arrive.
          scheduleLoadFlush();
        } else {
          appendSingleEntry(entry, dialoguesList.length - 1);
          Prism.highlightAll();
          msgContainer.scrollTop = msgContainer.scrollHeight;
        }
      }

      // Re-enable input after assistant response arrives
      if (ev.kind === 'assistant' && inputEnabled) {
        promptInput.removeAttribute('readonly');
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
        promptInput.focus();
      }
      if (ev.kind === 'assistant' && !inputEnabled) {
        sendBtn.textContent = 'Send';
      }
      break;
    }
    case 'reset': {
      // Cancel any pending load flush from a previous conversation.
      if (loadDebounceTimer != null) { clearTimeout(loadDebounceTimer); loadDebounceTimer = null; }
      dialoguesList = [];
      turnsList = [];
      msgContainer.innerHTML = '';
      // emptyState is re-attached by rerender() in flushLoad if the new
      // conversation has zero entries. For now show the loading spinner.
      updateSessionBadge(null);
      setChatState(false);
      enterLoadingState();
      break;
    }
    case 'banner': {
      if (msg.message) showError(msg.message);
      else hideError();
      break;
    }
    case 'inputEnabled': {
      setChatState(msg.enabled);
      if (!msg.enabled) {
        sendBtn.textContent = 'Send';
        removeThinkingIndicator();
      }
      break;
    }
    case 'sessionId': {
      updateSessionBadge(msg.sessionId);
      activeSessionId = msg.sessionId;
      break;
    }
  }
});

// ── Incremental single-entry append ──────────────────────────────────────────
// When not doing a full rerender, append just the newest entry.
// In group-by-turn mode we need to update/add the current turn card.
function appendSingleEntry(entry: DialogueEntry, entryIdx: number) {
  removeEmptyState();

  if (!groupByTurn) {
    // Individual mode: simple append
    const itemDiv = document.createElement('div');
    itemDiv.className = `message-item ${entry.sender}`;
    itemDiv.dataset.index = String(entryIdx);

    const cbDiv = buildCheckboxDiv(entryIdx, 'msgIdx', itemDiv);
    itemDiv.appendChild(cbDiv);

    const bubble = buildBubble();
    bubble.addEventListener('click', (e) => toggleBubbleSelection(e, cbDiv.querySelector('input')!, itemDiv));

    const header = document.createElement('div');
    header.className = 'bubble-header';
    const senderSpan = document.createElement('span');
    senderSpan.textContent = entry.sender === 'User' ? '👤 User' : `🤖 ${backendDisplayName}`;
    header.appendChild(senderSpan);
    const actionsDiv = document.createElement('div');
    actionsDiv.style.display = 'flex';
    actionsDiv.style.gap = '10px';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-btn';
    copyBtn.innerHTML = '📋 Copy';
    copyBtn.onclick = (e) => { e.stopPropagation(); copyText(entry.rawText); };
    actionsDiv.appendChild(copyBtn);
    header.appendChild(actionsDiv);
    bubble.appendChild(header);

    const content = document.createElement('div');
    content.className = 'bubble-content';
    content.innerHTML = marked.parse(entry.rawText) as string;
    addCopyButtonsToCodeBlocks(content);
    bubble.appendChild(content);

    itemDiv.appendChild(bubble);
    msgContainer.appendChild(itemDiv);
  } else {
    // Group-by-turn: full rerender is simplest / safest for live events
    rerender();
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
post({ type: 'ready' });
