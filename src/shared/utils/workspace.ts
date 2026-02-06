import type { WorkspaceType } from '@/shared/types/workspace';

export const SETTINGS_RETURN_KEY = 'settings:returnPath';

export function resolveWorkspaceFromPath(path: string): WorkspaceType | null {
  if (path === '/practice' || path.startsWith('/practice/')) return 'practice';
  if (
    path === '/client' ||
    path.startsWith('/client/')
  ) {
    return 'client';
  }
  if (path === '/embed' || path.startsWith('/embed/')) return 'public';
  return null;
}

export function getWorkspaceBasePath(workspace: WorkspaceType): string | null {
  if (workspace === 'practice') return '/practice';
  if (workspace === 'client') return '/client';
  if (workspace === 'public') return '/embed';
  return null;
}

export function getWorkspaceDashboardPath(workspace: WorkspaceType): string | null {
  if (workspace === 'practice') return '/practice';
  if (workspace === 'client') return '/client';
  return null;
}

export function getSettingsReturnPath(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(SETTINGS_RETURN_KEY);
}

export function setSettingsReturnPath(path: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(SETTINGS_RETURN_KEY, path);
}
