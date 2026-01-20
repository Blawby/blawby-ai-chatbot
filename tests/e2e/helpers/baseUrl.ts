import type { FullConfig } from '@playwright/test';

const DEFAULT_BASE_URL = process.env.E2E_BASE_URL || 'https://local.blawby.com';

export const resolveBaseUrl = (baseURL?: string): string => {
  if (typeof baseURL === 'string' && baseURL.length > 0) {
    return baseURL;
  }
  return DEFAULT_BASE_URL;
};

export const getBaseUrlFromConfig = (config: FullConfig): string => {
  const project = config.projects[0];
  return resolveBaseUrl(project?.use?.baseURL as string | undefined);
};
