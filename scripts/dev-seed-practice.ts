#!/usr/bin/env tsx
import { randomUUID } from 'crypto';

// Base URL for the Worker proxy (for practice API calls)
const WORKER_URL = process.env.DEV_SEED_BASE_URL ?? 'http://localhost:8787';
// Remote auth server URL (for sign-in)
const AUTH_SERVER_URL = process.env.DEV_SEED_AUTH_URL ?? 'https://staging-api.blawby.com';
const EMAIL = process.env.DEV_SEED_USER_EMAIL;
const PASSWORD = process.env.DEV_SEED_USER_PASSWORD;
const PRACTICE_NAME = process.env.DEV_SEED_PRACTICE_NAME ?? 'Dev Practice';
const PRACTICE_SLUG =
  process.env.DEV_SEED_PRACTICE_SLUG ??
  `dev-practice-${randomUUID().slice(0, 8)}`;
const BUSINESS_EMAIL =
  process.env.DEV_SEED_BUSINESS_EMAIL ?? 'test+practice@example.com';
const BUSINESS_PHONE =
  process.env.DEV_SEED_BUSINESS_PHONE ?? '+17025550123';
const CONSULTATION_FEE = Number.parseFloat(
  process.env.DEV_SEED_CONSULTATION_FEE ?? '150'
);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+[0-9]{1,15}$/;

if (!EMAIL || !PASSWORD) {
  console.error(
    'DEV_SEED_USER_EMAIL and DEV_SEED_USER_PASSWORD must be set in your environment.'
  );
  process.exit(1);
}

if (!EMAIL_REGEX.test(BUSINESS_EMAIL)) {
  console.error(
    `DEV_SEED_BUSINESS_EMAIL must be a valid email address. Received: ${BUSINESS_EMAIL}`
  );
  process.exit(1);
}

if (!PHONE_REGEX.test(BUSINESS_PHONE)) {
  console.error(
    `DEV_SEED_BUSINESS_PHONE must be an E.164 phone number (e.g. +15551234567). Received: ${BUSINESS_PHONE}`
  );
  process.exit(1);
}

if (!Number.isFinite(CONSULTATION_FEE) || CONSULTATION_FEE <= 0) {
  console.error(
    'DEV_SEED_CONSULTATION_FEE must be a positive number representing USD.'
  );
  process.exit(1);
}

async function main() {
  console.log(`🔐 Signing in as ${EMAIL} via ${AUTH_SERVER_URL} ...`);
  const authToken = await signIn(EMAIL, PASSWORD);
  console.log('✅ Auth token acquired');

  const practices = await listPractices(authToken);
  if (practices.length > 0) {
    console.log(
      `✅ Practice already exists (${practices
        .map((p: any) => p.name ?? p.slug ?? p.id)
        .join(', ')})`
    );
    return;
  }

  console.log('ℹ️  No practices found. Creating default practice...');
  const created = await createPractice(authToken);
  console.log(
    `🎉 Practice created: ${created?.name ?? created?.slug ?? created?.id}`
  );
}

async function signIn(email: string, password: string): Promise<string> {
  const response = await fetch(`${AUTH_SERVER_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
    redirect: 'manual',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sign-in failed (${response.status}): ${text}`);
  }

  const token =
    response.headers.get('set-auth-token') ??
    response.headers.get('Set-Auth-Token');

  if (!token) {
    throw new Error('Sign-in succeeded but no auth token was returned.');
  }

  return token;
}

async function listPractices(token: string): Promise<any[]> {
  const response = await fetch(`${WORKER_URL}/api/practice/list`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to list practices (${response.status}): ${text || 'No body'}`
    );
  }

  const json = await response.json().catch(() => ({}));
  if (Array.isArray(json)) {
    return json;
  }
  if (json && typeof json === 'object' && Array.isArray(json.practices)) {
    return json.practices;
  }
  return [];
}

async function createPractice(token: string): Promise<any> {
  const payload = {
    name: PRACTICE_NAME,
    slug: PRACTICE_SLUG,
    business_email: BUSINESS_EMAIL,
    business_phone: BUSINESS_PHONE,
    consultation_fee: CONSULTATION_FEE,
    metadata: {
      createdBy: 'dev-seed-script',
    },
  };

  const response = await fetch(`${WORKER_URL}/api/practice`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to create practice (${response.status}): ${text || 'No body'}`
    );
  }

  const json = await response.json().catch(() => ({}));
  if (json && typeof json === 'object') {
    if ('practice' in json) {
      return (json as { practice: any }).practice;
    }
    return json;
  }
  return null;
}

main().catch((err) => {
  console.error('❌ Dev seed failed:', err);
  process.exit(1);
});
