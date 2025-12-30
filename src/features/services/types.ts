import type { ComponentType } from 'preact';

export interface Service {
  id: string;
  title: string;
  description: string;
}

export interface ServiceTemplate extends Service {
  icon?: ComponentType<{ className?: string }>;
}

const DEFAULT_PREFIX = 'service';

export function createServiceId(prefix: string = DEFAULT_PREFIX): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
