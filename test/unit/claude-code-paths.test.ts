import { expect } from 'chai';
import * as path from 'path';
import * as os from 'os';
import { encodeCwd, decodeProjectDir, projectsRoot, projectDir } from '../../src/backends/claude-code/paths';

describe('claude-code paths', () => {
  it('encodes absolute cwd by replacing slashes with dashes', () => {
    expect(encodeCwd('/home/timothy/repos/chat')).to.equal('-home-timothy-repos-chat');
  });

  it('decodes encoded dir back to absolute cwd', () => {
    expect(decodeProjectDir('-home-timothy-repos-chat')).to.equal('/home/timothy/repos/chat');
  });

  it('round-trips paths with spaces (slashes only encoded; spaces preserved)', () => {
    const cwd = '/Users/x/My Repo/chat';
    expect(decodeProjectDir(encodeCwd(cwd))).to.equal(cwd);
  });

  it('projectsRoot returns ~/.claude/projects/', () => {
    expect(projectsRoot()).to.equal(path.join(os.homedir(), '.claude', 'projects'));
  });

  it('projectDir composes the per-project directory', () => {
    const cwd = '/home/timothy/repos/chat';
    expect(projectDir(cwd)).to.equal(path.join(os.homedir(), '.claude', 'projects', '-home-timothy-repos-chat'));
  });
});
