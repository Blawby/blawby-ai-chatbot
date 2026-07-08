import { Client } from 'pg';
import { loadE2EEnvFiles } from './e2eConfig';

export type VerifyTestUserEmailResult =
  | { status: 'verified' | 'already-verified'; message: string }
  | { status: 'not-configured' | 'unsafe-email' | 'not-found'; message: string };

const TEST_EMAIL_DOMAIN = '@test-blawby.com';

const getDatabaseUrl = (): string | null => {
  loadE2EEnvFiles();
  const value = process.env.E2E_DATABASE_URL
    ?? process.env.E2E_POSTGRES_URL
    ?? process.env.DATABASE_URL
    ?? null;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const shouldUseSsl = (databaseUrl: string): boolean | { rejectUnauthorized: false } => {
  if (process.env.E2E_DATABASE_SSL === 'false') return false;
  if (process.env.E2E_DATABASE_SSL === 'true') return { rejectUnauthorized: false };

  try {
    const url = new URL(databaseUrl);
    const sslMode = url.searchParams.get('sslmode')?.toLowerCase();
    const hostname = url.hostname.toLowerCase();
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    return sslMode === 'require' || !isLocal ? { rejectUnauthorized: false } : false;
  } catch {
    return false;
  }
};

const isSafeTestEmail = (email: string): boolean => email.trim().toLowerCase().endsWith(TEST_EMAIL_DOMAIN);

export async function verifyE2ETestUserEmail(email: string): Promise<VerifyTestUserEmailResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!isSafeTestEmail(normalizedEmail)) {
    return {
      status: 'unsafe-email',
      message: `Refusing to modify non-test email "${email}". Only ${TEST_EMAIL_DOMAIN} e2e users can be auto-verified.`,
    };
  }

  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    return {
      status: 'not-configured',
      message: 'E2E_DATABASE_URL, E2E_POSTGRES_URL, or DATABASE_URL is required to auto-verify generated e2e users.',
    };
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: shouldUseSsl(databaseUrl),
  });

  await client.connect();
  try {
    const existing = await client.query<{ email_verified: boolean }>(
      'SELECT email_verified FROM users WHERE lower(email) = lower($1) AND lower(email) LIKE $2 LIMIT 1',
      [normalizedEmail, `%${TEST_EMAIL_DOMAIN}`]
    );
    if (existing.rowCount === 0) {
      return {
        status: 'not-found',
        message: `No generated e2e user found for ${normalizedEmail}.`,
      };
    }
    if (existing.rows[0]?.email_verified === true) {
      return {
        status: 'already-verified',
        message: `${normalizedEmail} is already email verified.`,
      };
    }

    await client.query(
      'UPDATE users SET email_verified = true, updated_at = NOW() WHERE lower(email) = lower($1) AND lower(email) LIKE $2',
      [normalizedEmail, `%${TEST_EMAIL_DOMAIN}`]
    );
    return {
      status: 'verified',
      message: `${normalizedEmail} was marked email verified for e2e invitation acceptance.`,
    };
  } finally {
    await client.end();
  }
}
