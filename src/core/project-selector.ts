import type { Project } from '../backends/types';

export function pickDefaultProject(
  projects: Project[],
  workspaceFolderCwd: string | undefined,
  lastUsedProjectId: string | undefined,
): Project | undefined {
  if (projects.length === 0) return undefined;
  if (workspaceFolderCwd) {
    const match = projects.find((p) => p.cwd === workspaceFolderCwd);
    if (match) return match;
  }
  if (lastUsedProjectId) {
    const match = projects.find((p) => p.id === lastUsedProjectId);
    if (match) return match;
  }
  return projects[0];
}
