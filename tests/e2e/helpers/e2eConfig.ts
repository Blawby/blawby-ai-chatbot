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
  'owner@example.com',
  'client@example.com'
]);

const normalizeValue = (value: string | undefined | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (PLACEHOLDER_VALUES.has(trimmed)) return null;
  return trimmed;
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

export const loadE2EConfig = (): E2EConfig | null => {
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
