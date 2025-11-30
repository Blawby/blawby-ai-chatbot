import type { Env } from '../types.js';

export interface SessionRecord {
  id: string;
  practiceId: string;
  state: 'active' | 'closed' | 'archived';
  statusReason?: string | null;
  retentionHorizonDays: number;
  isHold: boolean;
  createdAt: string;
  updatedAt: string;
  lastActive: string;
  closedAt?: string | null;
  tokenHash?: string | null;
}

export interface SessionResolution {
  session: SessionRecord;
  sessionToken: string;
  cookie?: string;
  isNew: boolean;
  isEphemeral?: boolean;
}

export interface PersistedMessageInput {
  sessionId: string;
  practiceId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: unknown;
  tokenCount?: number;
  messageId?: string;
  createdAt?: number;
}

const SESSION_COOKIE_NAME = 'blawby_session';
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
const DEFAULT_RETENTION_DAYS = 180;

function toIsoString(timestamp?: number): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date();
  return date.toISOString();
}

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  const parts = header.split(';');
  for (const part of parts) {
    const [cookieName, ...rest] = part.trim().split('=');
    if (cookieName === name) {
      return rest.join('=');
    }
  }
  return null;
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

function mapSessionRow(row: Record<string, unknown>): SessionRecord {
  return {
    id: String(row.id),
    practiceId: String(row.organization_id), // DB column still named organization_id until migration
    state: (row.state as SessionRecord['state']) ?? 'active',
    statusReason: (row.status_reason as string) ?? null,
    retentionHorizonDays: typeof row.retention_horizon_days === 'number'
      ? row.retention_horizon_days
      : Number(row.retention_horizon_days ?? DEFAULT_RETENTION_DAYS),
    isHold: Boolean(row.is_hold),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    lastActive: String(row.last_active ?? new Date().toISOString()),
    closedAt: row.closed_at ? String(row.closed_at) : null,
    tokenHash: row.token_hash ? String(row.token_hash) : null
  };
}

async function tokensMatch(rawToken: string | null | undefined, tokenHashValue: string | null | undefined): Promise<boolean> {
  if (!rawToken || !tokenHashValue) {
    return false;
  }
  const computed = await hashToken(rawToken);
  return computed === tokenHashValue;
}

export class SessionService {
  static getCookieName(): string {
    return SESSION_COOKIE_NAME;
  }

  static getCookieMaxAgeSeconds(): number {
    return SESSION_COOKIE_MAX_AGE_SECONDS;
  }

  static buildSessionCookie(token: string, maxAgeSeconds = SESSION_COOKIE_MAX_AGE_SECONDS): string {
    const parts = [
      `${SESSION_COOKIE_NAME}=${token}`,
      'Path=/',
      `Max-Age=${maxAgeSeconds}`,
      'HttpOnly',
      'SameSite=Lax',
      'Secure'
    ];
    return parts.join('; ');
  }

  static getSessionTokenFromCookie(request: Request): string | null {
    return parseCookie(request.headers.get('Cookie'), SESSION_COOKIE_NAME);
  }

  static async getSessionById(env: Env, sessionId: string): Promise<SessionRecord | null> {
    const stmt = env.DB.prepare(`
      SELECT id, organization_id, state, status_reason, retention_horizon_days, is_hold,
             created_at, updated_at, last_active, closed_at, token_hash
        FROM chat_sessions
       WHERE id = ?
       LIMIT 1
    `);
    const row = await stmt.bind(sessionId).first<Record<string, unknown>>();
    if (!row) return null;
    return mapSessionRow(row);
  }

  static async getSessionByToken(env: Env, rawToken: string, practiceId: string): Promise<SessionRecord | null> {
    const tokenHashValue = await hashToken(rawToken);
    const stmt = env.DB.prepare(`
      SELECT id, organization_id, state, status_reason, retention_horizon_days, is_hold,
             created_at, updated_at, last_active, closed_at, token_hash
        FROM chat_sessions
       WHERE token_hash = ? AND organization_id = ?
       LIMIT 1
    `);
    const row = await stmt.bind(tokenHashValue, practiceId).first<Record<string, unknown>>();
    if (!row) return null;
    return mapSessionRow(row);
  }

  static async setSessionToken(env: Env, sessionId: string, rawToken: string): Promise<void> {
    const now = toIsoString();
    const tokenHashValue = await hashToken(rawToken);
    const stmt = env.DB.prepare(`
      UPDATE chat_sessions
         SET token_hash = ?, updated_at = ?, last_active = COALESCE(last_active, ?)
       WHERE id = ?
    `);
    await stmt.bind(tokenHashValue, now, now, sessionId).run();
  }

  static async touchSession(env: Env, sessionId: string): Promise<void> {
    const now = toIsoString();
    const stmt = env.DB.prepare(`
      UPDATE chat_sessions
         SET last_active = ?, updated_at = ?
       WHERE id = ?
    `);
    await stmt.bind(now, now, sessionId).run();
  }

  static async createSession(env: Env, options: {
    practiceId: string;
    sessionId?: string;
    sessionToken?: string;
    retentionHorizonDays?: number;
  }): Promise<SessionResolution> {
    const practiceId = options.practiceId.trim();
    const sessionId = options.sessionId?.trim() ?? crypto.randomUUID();
    const providedToken = options.sessionToken?.trim() ?? null;
    const initialToken = providedToken ?? crypto.randomUUID();
    const nowIso = toIsoString();
    const retention = options.retentionHorizonDays ?? DEFAULT_RETENTION_DAYS;
    const initialTokenHash = await hashToken(initialToken);

    const insertStmt = env.DB.prepare(`
      INSERT INTO chat_sessions (
        id, organization_id, token_hash, state, status_reason, retention_horizon_days,
        is_hold, created_at, updated_at, last_active
      ) VALUES (?, ?, ?, 'active', NULL, ?, 0, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `);

    const insertResult = await insertStmt.bind(
      sessionId,
      practiceId,
      initialTokenHash,
      retention,
      nowIso,
      nowIso,
      nowIso
    ).run();

    let sessionToken = initialToken;
    let cookie: string | undefined;
    const insertedChanges = ((insertResult.meta ?? {}) as { changes?: number }).changes ?? 0;
    let isNew = insertResult.success && insertedChanges > 0;

    const session = await this.getSessionById(env, sessionId);
    if (!session) {
      throw new Error('Failed to persist session');
    }

    if (session.practiceId !== practiceId) {
      throw new Error(`Session ${sessionId} belongs to practice ${session.practiceId}, cannot be accessed by practice ${practiceId}`);
    }

    if (isNew) {
      cookie = this.buildSessionCookie(sessionToken);
    } else {
      let needsTokenRotation = false;

      if (!providedToken && session.tokenHash) {
        // Client lacked a token; rotate to issue a fresh one.
        sessionToken = crypto.randomUUID();
        needsTokenRotation = true;
      } else if (!session.tokenHash) {
        // No token stored yet – use provided one or create a fresh token.
        sessionToken = providedToken ?? crypto.randomUUID();
        needsTokenRotation = true;
      } else if (providedToken) {
        const matches = await tokensMatch(providedToken, session.tokenHash);
        if (!matches) {
          sessionToken = crypto.randomUUID();
          needsTokenRotation = true;
        } else {
          sessionToken = providedToken;
        }
      } else {
        // No provided token and no stored hash handled above, so this means we need to rotate.
        sessionToken = crypto.randomUUID();
        needsTokenRotation = true;
      }

      if (needsTokenRotation) {
        await this.setSessionToken(env, sessionId, sessionToken);
        cookie = this.buildSessionCookie(sessionToken);
      }

      const updateStmt = env.DB.prepare(`
        UPDATE chat_sessions
           SET state = 'active',
               retention_horizon_days = ?,
               updated_at = ?,
               last_active = ?
         WHERE id = ? AND organization_id = ?
      `);

      await updateStmt.bind(
        retention,
        nowIso,
        nowIso,
        sessionId,
        practiceId
      ).run();
    }

    const refreshedSession = await this.getSessionById(env, sessionId);
    if (!refreshedSession) {
      throw new Error('Failed to load session after creation');
    }

    return {
      session: refreshedSession,
      sessionToken,
      cookie,
      isNew
    };
  }

  /**
   * Simplified session resolution that can derive organization from session ID
   * This is useful when you have a session ID but don't know the organization
   */
  static async resolveSessionById(env: Env, options: {
    request?: Request;
    sessionId: string;
    sessionToken?: string | null;
    retentionHorizonDays?: number;
    createIfMissing?: boolean;
  }): Promise<SessionResolution> {
    try {
      let providedToken = options.sessionToken ?? null;
      if (!providedToken && options.request) {
        providedToken = this.getSessionTokenFromCookie(options.request);
      }

      // First, try to get the session by ID to determine organization
      let session = await this.getSessionById(env, options.sessionId);
      
      if (session) {
        // Session exists, use its organization
        const resolution = await this.resolveSession(env, {
          request: options.request,
          sessionId: options.sessionId,
          sessionToken: providedToken,
          practiceId: session.practiceId,
          retentionHorizonDays: options.retentionHorizonDays,
          createIfMissing: false
        });
        return resolution;
      }

      // Session doesn't exist, but we can't create without organization
      if (options.createIfMissing === false) {
        throw new Error('Session not found and creation disabled');
      }
      
      throw new Error('Session not found and organization cannot be determined for creation');
    } catch (error) {
      console.error('Session resolution by ID failed:', error);
      throw error;
    }
  }

  static async resolveSession(env: Env, options: {
    request?: Request;
    sessionId?: string;
    sessionToken?: string | null;
    practiceId: string;
    retentionHorizonDays?: number;
    createIfMissing?: boolean;
  }): Promise<SessionResolution> {
    try {
      const normalizedPractice = options.practiceId.trim();
      let providedToken = options.sessionToken ?? null;
      if (!providedToken && options.request) {
        providedToken = this.getSessionTokenFromCookie(options.request);
      }

      let session: SessionRecord | null = null;

      if (options.sessionId) {
        session = await this.getSessionById(env, options.sessionId);
        if (session && session.practiceId !== normalizedPractice) {
          session = null;
        }
      }

      if (!session && providedToken) {
        session = await this.getSessionByToken(env, providedToken, normalizedPractice);
      }

      if (!session) {
        if (options.createIfMissing === false) {
          throw new Error('Session not found and creation disabled');
        }
        const created = await this.createSession(env, {
          practiceId: normalizedPractice,
          sessionId: options.sessionId,
          sessionToken: providedToken ?? undefined,
          retentionHorizonDays: options.retentionHorizonDays
        });
        return created;
      }

      let cookie: string | undefined;
      let sessionToken = providedToken ?? crypto.randomUUID();

      if (!(await tokensMatch(providedToken, session.tokenHash))) {
        sessionToken = crypto.randomUUID();
        await this.setSessionToken(env, session.id, sessionToken);
        cookie = this.buildSessionCookie(sessionToken);
        session.tokenHash = await hashToken(sessionToken);
      }

      try {
        await this.touchSession(env, session.id);
        
        // Only update in-memory state after successful DB update
        session.lastActive = new Date().toISOString();
      } catch (error) {
        console.error('[SessionService] Failed to touch session:', error);
        // Rethrow or return error result; don't update in-memory state
        throw error;
      }

      return {
        session: session,
        sessionToken,
        cookie,
        isNew: false
      };
    } catch (error) {
      console.warn('[SessionService] Falling back to ephemeral session', {
        practiceId: options.practiceId,
        sessionId: options.sessionId,
        message: error instanceof Error ? error.message : String(error)
      });
      return this.createEphemeralSession(options.practiceId, {
        sessionId: options.sessionId,
        sessionToken: options.sessionToken ?? undefined
      });
    }
  }

  static async persistMessage(env: Env, input: PersistedMessageInput): Promise<void> {
    const session = await this.getSessionById(env, input.sessionId);
    if (!session || session.practiceId !== input.practiceId) {
      throw new Error('Cannot persist message: session not found or practice mismatch');
    }

    const messageId = input.messageId ?? crypto.randomUUID();
    const createdAt = toIsoString(input.createdAt);
    const metadata = input.metadata ? JSON.stringify(input.metadata) : null;

    const stmt = env.DB.prepare(`
      INSERT INTO chat_messages (
        id, session_id, organization_id, role, content, metadata, token_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        metadata = excluded.metadata,
        token_count = excluded.token_count
       WHERE chat_messages.organization_id = excluded.organization_id
         AND chat_messages.session_id = excluded.session_id
    `);

    await stmt.bind(
      messageId,
      input.sessionId,
      input.practiceId,
      input.role,
      input.content,
      metadata,
      input.tokenCount ?? null,
      createdAt
    ).run();
  }

  private static createEphemeralSession(
    practiceId: string,
    options: { sessionId?: string | null; sessionToken?: string }
  ): SessionResolution {
    const sessionId = options.sessionId && options.sessionId.trim().length > 0
      ? options.sessionId.trim()
      : crypto.randomUUID();
    const sessionToken = options.sessionToken && options.sessionToken.trim().length > 0
      ? options.sessionToken.trim()
      : crypto.randomUUID();
    const nowIso = toIsoString();

    const session: SessionRecord = {
      id: sessionId,
      practiceId: practiceId.trim(),
      state: 'active',
      statusReason: 'ephemeral_fallback',
      retentionHorizonDays: DEFAULT_RETENTION_DAYS,
      isHold: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastActive: nowIso,
      closedAt: null,
      tokenHash: null
    };

    const cookie = this.buildSessionCookie(sessionToken);

    return {
      session,
      sessionToken,
      cookie,
      isNew: true,
      isEphemeral: true
    };
  }
}
