export type NormalizedEvent =
  | { kind: 'user'; text: string; ts: number }
  | { kind: 'assistant'; markdown: string; ts: number }
  | { kind: 'tool_use'; name: string; summary: string; ts: number }
  | { kind: 'thinking'; text: string; ts: number }
  | { kind: 'error'; message: string; ts: number };
