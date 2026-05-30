import type { NormalizedEvent } from '../../core/events';

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; name: string; input?: unknown }
  | { type: 'tool_result'; tool_use_id?: string; content?: unknown };

interface RawLine {
  type?: string;
  isMeta?: boolean;
  message?: { role?: string; content?: string | ContentBlock[] };
  timestamp?: string;
}

export function parseLine(line: string): NormalizedEvent | null {
  let raw: RawLine;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  // System-injected user lines (e.g. skill activation messages) — skip.
  if (raw.isMeta) return null;

  const ts = raw.timestamp ? Date.parse(raw.timestamp) : Date.now();
  const role = raw.message?.role;
  const content = raw.message?.content;
  if (!role || content === undefined || content === null) return null;

  if (role === 'user') {
    // Real Claude Code JSONL shape: user content is usually a plain string
    // (what the user typed). Sometimes it's an array — but for the user role
    // array content is typically tool_result blocks (the user's environment
    // responding to a tool call), not free-text input, so we skip those.
    if (typeof content === 'string') {
      return content.length > 0 ? { kind: 'user', text: content, ts } : null;
    }
    if (Array.isArray(content)) {
      const text = content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('');
      return text.length > 0 ? { kind: 'user', text, ts } : null;
    }
    return null;
  }

  if (role === 'assistant') {
    // Assistant content is always a block array.
    if (!Array.isArray(content) || content.length === 0) return null;
    const textBlocks = content.filter((c): c is { type: 'text'; text: string } => c.type === 'text');
    if (textBlocks.length > 0) {
      return { kind: 'assistant', markdown: textBlocks.map((b) => b.text).join(''), ts };
    }
    const thinking = content.find((c): c is { type: 'thinking'; thinking: string } => c.type === 'thinking');
    if (thinking) return { kind: 'thinking', text: thinking.thinking, ts };
    const tool = content.find((c): c is { type: 'tool_use'; name: string; input?: unknown } => c.type === 'tool_use');
    if (tool) {
      const summary = typeof tool.input === 'object' ? JSON.stringify(tool.input) : String(tool.input ?? '');
      return { kind: 'tool_use', name: tool.name, summary, ts };
    }
  }

  return null;
}
