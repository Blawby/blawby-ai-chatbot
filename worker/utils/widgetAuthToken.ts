import type { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';

const WIDGET_TOKEN_VERSION = 1;
const WIDGET_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
const WIDGET_TOKEN_QUERY_SOURCE_TTL_SECONDS = 5 * 60; // 5 minutes
const BASE64_CHUNK_SIZE = 0x8000;

export interface WidgetAuthClaims {
  v: number;
  sub: string;
  sid: string;
  anon: 1;
  iat: number;
  exp: number;
}

export interface ValidatedWidgetAuthToken {
  userId: string;
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
}

export type WidgetTokenSource = 'authorization' | 'query';

export interface ExtractedWidgetToken {
  token: string;
  tokenSource: WidgetTokenSource;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const toBase64Url = (input: Uint8Array): string => {
  let binary = '';
  for (let offset = 0; offset < input.length; offset += BASE64_CHUNK_SIZE) {
    const chunk = input.subarray(offset, offset + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const fromBase64Url = (input: string): Uint8Array => {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
};

const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
};

const resolveWidgetTokenSecret = (env: Env): string => {
  const secret = typeof env.WIDGET_AUTH_TOKEN_SECRET === 'string'
    ? env.WIDGET_AUTH_TOKEN_SECRET.trim()
    : '';
  if (!secret) {
    throw HttpErrors.internalServerError('WIDGET_AUTH_TOKEN_SECRET must be configured');
  }
  return secret;
};

const importSigningKey = async (env: Env) => {
  const secret = resolveWidgetTokenSecret(env);
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
};

const sign = async (payload: string, env: Env): Promise<Uint8Array> => {
  const key = await importSigningKey(env);
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(payload));
  return new Uint8Array(signature);
};

const parseClaims = (raw: unknown): WidgetAuthClaims => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw HttpErrors.unauthorized('Invalid widget auth token');
  }
  const claims = raw as Record<string, unknown>;
  const v = claims.v;
  const sub = claims.sub;
  const sid = claims.sid;
  const anon = claims.anon;
  const iat = claims.iat;
  const exp = claims.exp;

  if (v !== WIDGET_TOKEN_VERSION) throw HttpErrors.unauthorized('Invalid widget auth token');
  if (typeof sub !== 'string' || sub.trim().length === 0) throw HttpErrors.unauthorized('Invalid widget auth token');
  if (typeof sid !== 'string' || sid.trim().length === 0) throw HttpErrors.unauthorized('Invalid widget auth token');
  if (anon !== 1) throw HttpErrors.unauthorized('Invalid widget auth token');
  if (!Number.isFinite(iat) || !Number.isFinite(exp)) throw HttpErrors.unauthorized('Invalid widget auth token');

  return {
    v: WIDGET_TOKEN_VERSION,
    sub: sub.trim(),
    sid: sid.trim(),
    anon: 1,
    iat: Number(iat),
    exp: Number(exp),
  };
};

export const issueWidgetAuthToken = async (
  env: Env,
  params: { userId: string; sessionId: string },
  options?: { ttlSeconds?: number }
): Promise<{ token: string; expiresAt: string }> => {
  const userId = params.userId.trim();
  const sessionId = params.sessionId.trim();
  if (!userId || !sessionId) {
    throw HttpErrors.badRequest('Cannot issue widget token without user and session identifiers');
  }

  const now = Math.floor(Date.now() / 1000);
  const requestedTtlSeconds = typeof options?.ttlSeconds === 'number'
    ? options.ttlSeconds
    : NaN;
  const ttlSeconds = Number.isFinite(requestedTtlSeconds)
    ? Math.max(60, Math.floor(requestedTtlSeconds))
    : WIDGET_TOKEN_TTL_SECONDS;
  const claims: WidgetAuthClaims = {
    v: WIDGET_TOKEN_VERSION,
    sub: userId,
    sid: sessionId,
    anon: 1,
    iat: now,
    exp: now + ttlSeconds,
  };

  const payloadPart = toBase64Url(textEncoder.encode(JSON.stringify(claims)));
  const signature = await sign(payloadPart, env);
  const signaturePart = toBase64Url(signature);
  const token = `${payloadPart}.${signaturePart}`;
  const expiresAt = new Date(claims.exp * 1000).toISOString();
  return { token, expiresAt };
};

export const extractWidgetTokenFromRequest = (request: Request): ExtractedWidgetToken | null => {
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1]) {
      const token = match[1].trim();
      if (token.length > 0) {
        return { token, tokenSource: 'authorization' };
      }
    }
  }

  // Query-param tokens are accepted only for WebSocket auth handshakes where
  // browsers cannot set custom Authorization headers on `new WebSocket(...)`.
  const upgrade = request.headers.get('upgrade');
  const isWebSocketUpgrade = typeof upgrade === 'string' && upgrade.toLowerCase() === 'websocket';
  if (!isWebSocketUpgrade) {
    return null;
  }
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('bw_token');
  if (queryToken && queryToken.trim().length > 0) {
    return { token: queryToken.trim(), tokenSource: 'query' };
  }

  return null;
};

export const getWidgetTokenTtlForSource = (source: WidgetTokenSource): number =>
  source === 'query' ? WIDGET_TOKEN_QUERY_SOURCE_TTL_SECONDS : WIDGET_TOKEN_TTL_SECONDS;

export const validateWidgetAuthToken = async (
  token: string,
  env: Env
): Promise<ValidatedWidgetAuthToken> => {
  const trimmed = token.trim();
  if (!trimmed) throw HttpErrors.unauthorized('Invalid widget auth token');
  const parts = trimmed.split('.');
  if (parts.length !== 2) throw HttpErrors.unauthorized('Invalid widget auth token');
  const [payloadPart, signaturePart] = parts;
  if (!payloadPart || !signaturePart) throw HttpErrors.unauthorized('Invalid widget auth token');

  const expectedSignature = await sign(payloadPart, env);
  let actualSignature: Uint8Array;
  try {
    actualSignature = fromBase64Url(signaturePart);
  } catch {
    throw HttpErrors.unauthorized('Invalid widget auth token');
  }
  if (!timingSafeEqual(expectedSignature, actualSignature)) {
    throw HttpErrors.unauthorized('Invalid widget auth token');
  }

  let payloadRaw: unknown;
  try {
    const json = textDecoder.decode(fromBase64Url(payloadPart));
    payloadRaw = JSON.parse(json);
  } catch {
    throw HttpErrors.unauthorized('Invalid widget auth token');
  }

  const claims = parseClaims(payloadRaw);
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp <= now) {
    throw HttpErrors.unauthorized('Widget auth token expired');
  }

  return {
    userId: claims.sub,
    sessionId: claims.sid,
    issuedAt: claims.iat,
    expiresAt: claims.exp,
  };
};
