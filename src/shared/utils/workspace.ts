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
  if (path === '/public' || path.startsWith('/public/')) return 'public';
  return null;
}

export function getWorkspaceBasePath(workspace: WorkspaceType): string | null {
  if (workspace === 'practice') return '/practice';
  if (workspace === 'client') return '/client';
  if (workspace === 'public') return '/public';
  return null;
}

export function getWorkspaceHomePath(
  workspace: WorkspaceType,
  slug?: string | null,
  fallback = '/'
): string {
  if (workspace === 'practice' && slug) return `/practice/${encodeURIComponent(slug)}`;
  if (workspace === 'client' && slug) return `/client/${encodeURIComponent(slug)}`;
  if (workspace === 'public' && slug) return `/public/${encodeURIComponent(slug)}`;
  return fallback;
}


/**
 * Generate a workspace resource path using route patterns and URL encoding.
 * Supports pattern matching like `/practice/:practiceSlug/conversations`
 */
export function generateWorkspacePath(
  pattern: string,
  params: Record<string, string | null | undefined>
): string | null {
  let path = pattern;
  
  // Replace path parameters with encoded values
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      const encoded = encodeURIComponent(value);
      path = path.replace(`:${key}`, encoded);
    }
  }
  
  // Check if all parameters were replaced
  if (path.includes(':')) {
    return null;
  }
  
  return path;
}

/**
 * Generate a workspace conversations path for the given workspace and practice slug.
 * Returns null if required params are missing.
 * Routes: `/practice/:practiceSlug/conversations` or `/client/:practiceSlug/conversations`
 */
export function getWorkspaceConversationsPath(
  workspace: WorkspaceType,
  slug?: string | null
): string | null {
  if (!slug) return null;
  
  if (workspace === 'practice') {
    return generateWorkspacePath('/practice/:practiceSlug/conversations', { practiceSlug: slug });
  }
  if (workspace === 'client') {
    return generateWorkspacePath('/client/:practiceSlug/conversations', { practiceSlug: slug });
  }
  if (workspace === 'public') {
    return generateWorkspacePath('/public/:practiceSlug/conversations', { practiceSlug: slug });
  }
  
  return null;
}

/**
 * Generate a workspace matters path for the given workspace and practice slug.
 * Returns null if required params are missing.
 * Routes: `/practice/:practiceSlug/matters` or `/client/:practiceSlug/matters`
 */
export function getWorkspaceMattersPath(
  workspace: WorkspaceType,
  slug?: string | null
): string | null {
  if (!slug) return null;
  
  if (workspace === 'practice') {
    return generateWorkspacePath('/practice/:practiceSlug/matters', { practiceSlug: slug });
  }
  if (workspace === 'client') {
    return generateWorkspacePath('/client/:practiceSlug/matters', { practiceSlug: slug });
  }
  if (workspace === 'public') {
    return generateWorkspacePath('/public/:practiceSlug/matters', { practiceSlug: slug });
  }
  
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

export function resolveSettingsBasePath(path: string): string {
  const segments = path.split('/').filter(Boolean);
  const settingsIndex = segments.indexOf('settings');
  if (settingsIndex === -1) {
    return '/settings';
  }
  return `/${segments.slice(0, settingsIndex + 1).join('/')}`;
}

export function buildSettingsPath(basePath: string, subPath?: string): string {
  const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  if (!subPath) return normalizedBase;
  const normalizedSub = subPath.replace(/^\/+/, '');
  return `${normalizedBase}/${normalizedSub}`;
}

export function rewriteLegacySettingsPath(currentPath: string, targetPath: string): string {
  if (!targetPath.startsWith('/settings')) {
    return targetPath;
  }

  const queryIndex = targetPath.indexOf('?');
  const hashIndex = targetPath.indexOf('#');
  const splitIndex = [queryIndex, hashIndex].filter((idx) => idx >= 0).sort((a, b) => a - b)[0] ?? -1;
  const pathOnly = splitIndex >= 0 ? targetPath.slice(0, splitIndex) : targetPath;
  const suffix = splitIndex >= 0 ? targetPath.slice(splitIndex) : '';
  const settingsSubPath = pathOnly.replace(/^\/settings\/?/, '');

  const workspaceMatch = currentPath.match(/^\/(practice|client)\/([^/]+)/);
  if (workspaceMatch) {
    const workspace = workspaceMatch[1];
    const slug = workspaceMatch[2];
    const base = `/${workspace}/${slug}/settings`;
    return `${buildSettingsPath(base, settingsSubPath || undefined)}${suffix}`;
  }

  const currentSettingsBase = resolveSettingsBasePath(currentPath);
  if (currentSettingsBase !== '/settings') {
    return `${buildSettingsPath(currentSettingsBase, settingsSubPath || undefined)}${suffix}`;
  }

  return targetPath;
}
