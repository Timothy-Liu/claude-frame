import { expect } from 'chai';
import { SessionMetadataStore, sessionMetaKey, lastProjectKey } from '../../src/core/metadata';

class FakeMemento {
  private map = new Map<string, unknown>();
  get<T>(key: string): T | undefined { return this.map.get(key) as T | undefined; }
  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) this.map.delete(key); else this.map.set(key, value);
  }
  keys(): readonly string[] { return [...this.map.keys()]; }
}

describe('metadata', () => {
  it('namespaces session keys by backend id', () => {
    expect(sessionMetaKey('claude-code', 'abc')).to.equal('meta-claude-code-abc');
    expect(sessionMetaKey('other-backend', 'abc')).to.equal('meta-other-backend-abc');
  });

  it('namespaces last-project keys by backend id', () => {
    expect(lastProjectKey('claude-code')).to.equal('last-project-claude-code');
  });

  it('stores and retrieves session metadata', async () => {
    const store = new SessionMetadataStore(new FakeMemento() as never);
    await store.setSessionMeta('claude-code', 'abc', { title: 'Refactor', color: 'red' });
    const got = store.getSessionMeta('claude-code', 'abc');
    expect(got).to.deep.equal({ title: 'Refactor', color: 'red' });
  });

  it('returns undefined for unset metadata', () => {
    const store = new SessionMetadataStore(new FakeMemento() as never);
    expect(store.getSessionMeta('claude-code', 'missing')).to.be.undefined;
  });

  it('stores and retrieves last project per backend', async () => {
    const store = new SessionMetadataStore(new FakeMemento() as never);
    await store.setLastProject('claude-code', 'proj-1');
    expect(store.getLastProject('claude-code')).to.equal('proj-1');
    expect(store.getLastProject('other-backend')).to.be.undefined;
  });
});
