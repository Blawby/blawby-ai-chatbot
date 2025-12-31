import type { WorkspaceType } from '@/shared/types/workspace';

export const WORKSPACE_STORAGE_KEY = 'workspace:last';
export const SETTINGS_RETURN_KEY = 'settings:returnPath';

export function resolveWorkspaceFromPath(path: string): WorkspaceType | null {
  if (path === '/practice' || path.startsWith('/practice/')) return 'practice';
  if (path === '/app' || path.startsWith('/app/')) return 'client';
  if (path === '/p' || path.startsWith('/p/')) return 'public';
  return null;
}

export function getStoredWorkspace(): WorkspaceType | null {
  if (typeof window === 'undefined') return null;
  const stored = window.sessionStorage.getItem(WORKSPACE_STORAGE_KEY);
  return stored === 'client' || stored === 'practice' || stored === 'public' ? stored : null;
}

export function setStoredWorkspace(workspace: WorkspaceType): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(WORKSPACE_STORAGE_KEY, workspace);
}

export function getSettingsReturnPath(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(SETTINGS_RETURN_KEY);
}

export function setSettingsReturnPath(path: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(SETTINGS_RETURN_KEY, path);
}
