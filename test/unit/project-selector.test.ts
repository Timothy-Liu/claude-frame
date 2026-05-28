import { expect } from 'chai';
import { pickDefaultProject } from '../../src/core/project-selector';
import type { Project } from '../../src/backends/types';

const p = (cwd: string): Project => ({ id: cwd, label: cwd, cwd });

describe('pickDefaultProject', () => {
  it('returns the project whose cwd matches the workspace folder', () => {
    const projects = [p('/a'), p('/b'), p('/c')];
    expect(pickDefaultProject(projects, '/b', undefined)?.id).to.equal('/b');
  });

  it('falls back to the last-used project when no workspace match', () => {
    const projects = [p('/a'), p('/b'), p('/c')];
    expect(pickDefaultProject(projects, '/zzz', '/c')?.id).to.equal('/c');
  });

  it('falls back to the first project when last-used is gone', () => {
    const projects = [p('/a'), p('/b'), p('/c')];
    expect(pickDefaultProject(projects, '/zzz', '/missing')?.id).to.equal('/a');
  });

  it('returns undefined when there are no projects', () => {
    expect(pickDefaultProject([], '/anything', undefined)).to.be.undefined;
  });

  it('prefers workspace match even when last-used is also present', () => {
    const projects = [p('/a'), p('/b'), p('/c')];
    expect(pickDefaultProject(projects, '/a', '/c')?.id).to.equal('/a');
  });
});
