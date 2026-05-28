import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { parseLine } from '../../src/backends/claude-code/parser';

const fixture = fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'claude-code-sample.jsonl'),
  'utf8',
).split('\n').filter((l) => l.length > 0);

describe('claude-code parser', () => {
  it('parses a user text message to a user NormalizedEvent', () => {
    const ev = parseLine(fixture[0]);
    expect(ev).to.deep.include({ kind: 'user', text: 'hi' });
    expect(ev?.ts).to.be.a('number');
  });

  it('parses an assistant text message to an assistant NormalizedEvent', () => {
    const ev = parseLine(fixture[1]);
    expect(ev).to.deep.include({ kind: 'assistant', markdown: 'hello' });
  });

  it('parses a thinking block to a thinking event', () => {
    const ev = parseLine(fixture[2]);
    expect(ev).to.deep.include({ kind: 'thinking', text: 'considering options' });
  });

  it('parses a tool_use block to a tool_use event with name and summary', () => {
    const ev = parseLine(fixture[3]);
    expect(ev?.kind).to.equal('tool_use');
    if (ev?.kind === 'tool_use') {
      expect(ev.name).to.equal('bash');
      expect(ev.summary).to.contain('ls -la');
    }
  });

  it('concatenates multiple text blocks in a single assistant message', () => {
    const ev = parseLine(fixture[4]);
    expect(ev).to.deep.include({ kind: 'assistant', markdown: 'part 1 part 2' });
  });

  it('parses a user message with string content (what the user actually typed)', () => {
    const ev = parseLine(fixture[5]);
    expect(ev).to.deep.include({ kind: 'user', text: 'typed by the user' });
  });

  it('returns null for user messages whose content array is only tool_result blocks', () => {
    expect(parseLine(fixture[6])).to.be.null;
  });

  it('returns null for isMeta:true lines (system-injected, e.g. skill activation)', () => {
    expect(parseLine(fixture[7])).to.be.null;
  });

  it('returns null for non-JSON or unrecognized shapes', () => {
    expect(parseLine('not json')).to.be.null;
    expect(parseLine('{}')).to.be.null;
  });
});
