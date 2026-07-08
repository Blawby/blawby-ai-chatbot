import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

interface E2EUser {
  email: string;
  password: string;
}

export interface E2EConfig {
  practice: {
    id: string;
    slug: string;
  };
  owner: E2EUser;
  client: E2EUser;
}

const PLACEHOLDER_VALUES = new Set([
  'change-me',
  'your-practice-uuid',
  'your-practice-slug',
  'owner@test-blawby.com',
  'client@test-blawby.com'
]);

let envFilesLoaded = false;

const parseEnvValue = (value: string): string => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

export const loadE2EEnvFiles = (): void => {
  if (envFilesLoaded) return;
  envFilesLoaded = true;
  const protectedEnvKeys = new Set(Object.keys(process.env));

  for (const fileName of ['.env', '.env.local']) {
    const filePath = resolve(process.cwd(), fileName);
    if (!existsSync(filePath)) continue;

    const raw = readFileSync(filePath, 'utf-8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (!key || protectedEnvKeys.has(key)) continue;
      process.env[key] = parseEnvValue(rawValue);
    }
  }
};

const normalizeValue = (value: string | undefined | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (PLACEHOLDER_VALUES.has(trimmed)) return null;
  return trimmed;
};

export const normalizeE2EPracticeSlug = (value: string | null | undefined, fallback: string): string => {
  const normalized = normalizeValue(value);
  if (!normalized) return fallback;
  try {
    const url = new URL(normalized);
    const segments = url.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? fallback;
  } catch {
    if (normalized.includes('/')) {
      const segments = normalized.split('/').filter(Boolean);
      return segments[segments.length - 1] ?? fallback;
    }
    return normalized;
  }
};

const readConfigFile = (): Partial<E2EConfig> | null => {
  const filePath = resolve(process.cwd(), 'tests/e2e/fixtures/e2e-credentials.json');
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as Partial<E2EConfig>;
  } catch {
    return null;
  }
};

export const loadE2EPracticeConfig = (): E2EConfig['practice'] | null => {
  loadE2EEnvFiles();
  const fileConfig = readConfigFile();
  const practiceId = normalizeValue(process.env.E2E_PRACTICE_ID) ?? normalizeValue(fileConfig?.practice?.id);
  const practiceSlug = normalizeValue(process.env.E2E_PRACTICE_SLUG) ?? normalizeValue(fileConfig?.practice?.slug);
  if (!practiceId || !practiceSlug) return null;
  return { id: practiceId, slug: practiceSlug };
};

export const resolveE2EPracticeSlug = (
  fallback: string,
  options: { allowWidgetOverride?: boolean } = {}
): string => {
  loadE2EEnvFiles();
  const fileConfig = readConfigFile();
  const widgetSlug = options.allowWidgetOverride ? normalizeValue(process.env.E2E_WIDGET_SLUG) : null;
  const practiceSlug = normalizeValue(process.env.E2E_PRACTICE_SLUG) ?? normalizeValue(fileConfig?.practice?.slug);
  return normalizeE2EPracticeSlug(widgetSlug ?? practiceSlug, fallback);
};

export const loadE2EConfig = (): E2EConfig | null => {
  loadE2EEnvFiles();
  const fileConfig = readConfigFile();

  const practiceId = normalizeValue(process.env.E2E_PRACTICE_ID) ?? normalizeValue(fileConfig?.practice?.id);
  const practiceSlug = normalizeValue(process.env.E2E_PRACTICE_SLUG) ?? normalizeValue(fileConfig?.practice?.slug);
  const ownerEmail = normalizeValue(process.env.E2E_OWNER_EMAIL) ?? normalizeValue(fileConfig?.owner?.email);
  const ownerPassword = normalizeValue(process.env.E2E_OWNER_PASSWORD) ?? normalizeValue(fileConfig?.owner?.password);
  const clientEmail = normalizeValue(process.env.E2E_CLIENT_EMAIL) ?? normalizeValue(fileConfig?.client?.email);
  const clientPassword = normalizeValue(process.env.E2E_CLIENT_PASSWORD) ?? normalizeValue(fileConfig?.client?.password);
  if (!practiceId || !practiceSlug || !ownerEmail || !ownerPassword || !clientEmail || !clientPassword) {
    const missing = [];
    if (!practiceId) missing.push('E2E_PRACTICE_ID / tests/e2e/fixtures/e2e-credentials.json practice.id');
    if (!practiceSlug) missing.push('E2E_PRACTICE_SLUG / fixtures practice.slug');
    if (!ownerEmail) missing.push('E2E_OWNER_EMAIL / fixtures owner.email');
    if (!ownerPassword) missing.push('E2E_OWNER_PASSWORD / fixtures owner.password');
    if (!clientEmail) missing.push('E2E_CLIENT_EMAIL / fixtures client.email');
    if (!clientPassword) missing.push('E2E_CLIENT_PASSWORD / fixtures client.password');
    console.warn(`E2E config missing: ${missing.join(', ')}`);
    return null;
  }

  return {
    practice: {
      id: practiceId,
      slug: practiceSlug
    },
    owner: {
      email: ownerEmail,
      password: ownerPassword
    },
    client: {
      email: clientEmail,
      password: clientPassword
    }
  };
};
