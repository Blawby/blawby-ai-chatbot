const ENV_TRUSTED_PARENT_ORIGINS = (import.meta.env.VITE_TRUSTED_PARENT_ORIGINS ?? '')
  .split(',')
  .map((value: string) => value.trim())
  .filter(Boolean);

const ALLOWED_PARENT_ORIGINS = new Set([
  'https://staging.blawby.com',
  'https://app.blawby.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5137',
  ...ENV_TRUSTED_PARENT_ORIGINS,
]);

const parseTrustedParentOriginFromQuery = (): string | null => {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('trusted_parent_origin');
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    if (!isHttp) return null;
    if (!ALLOWED_PARENT_ORIGINS.has(parsed.origin)) return null;
    return parsed.origin;
  } catch {
    return null;
  }
};

export const resolveAllowedParentOrigins = (): string[] => {
  if (typeof window === 'undefined') return [];
  const origins = new Set<string>();
  const trustedParentOrigin = parseTrustedParentOriginFromQuery();
  if (trustedParentOrigin) {
    origins.add(trustedParentOrigin);
  }

  const referrer = typeof document !== 'undefined' ? document.referrer : '';
  if (referrer) {
    try {
      const origin = new URL(referrer).origin;
      if (ALLOWED_PARENT_ORIGINS.has(origin)) {
        origins.add(origin);
      } else if (window.parent !== window && origin === window.location.origin) {
        origins.add(origin);
      }
    } catch {
      // ignore malformed referrer
    }
  }

  // Use cast because location.ancestorOrigins is non-standard but available in some browsers
  const ancestorOrigins = (window.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
  if (ancestorOrigins && ancestorOrigins.length > 0) {
    for (let i = 0; i < ancestorOrigins.length; i += 1) {
      const origin = ancestorOrigins.item(i);
      if (origin && ALLOWED_PARENT_ORIGINS.has(origin)) {
        origins.add(origin);
      }
    }
  }

  return Array.from(origins);
};

export const postToParentFrame = (message: unknown, allowAnyOrigin = false) => {
  if (typeof window === 'undefined') return;
  if (window.parent === window) return;

  const isMessageObject = message && typeof message === 'object' && 'type' in message;
  const messageType = isMessageObject ? (message as { type: string }).type : null;

  // For sensitive requests like closing, or when explicitly requested via allowAnyOrigin,
  // we restrict wildcard posting to a strict allow-list of non-sensitive message types.
  const isSafeForWildcard = messageType === 'blawby:close-request';

  if (allowAnyOrigin || isSafeForWildcard) {
    try {
      // If we are posting to '*', only send safe message types and sanitize the payload
      // to avoid leaking arbitrary state to untrusted parent origins.
      if (isSafeForWildcard) {
        window.parent.postMessage({ type: 'blawby:close-request' }, '*');
      } else if (allowAnyOrigin) {
        // If allowAnyOrigin is true but it's not a known safe-list type, we still
        // skip wildcard to be safe, or we could log a warning.
        // For now, we only allow explicit safe types to go to '*'.
        console.warn('[WidgetEvents] allowAnyOrigin requested but message type is not in safe-list; skipping wildcard');
      }
    } catch (error) {
      console.warn('[WidgetEvents] Failed to notify parent frame via wildcard', error);
    }

    // If it was a close request, we are done (it's already sent to '*').
    // If it's another type, we fall through to try trusted origins if any exist.
    if (isSafeForWildcard) return;
  }

  const allowedOrigins = resolveAllowedParentOrigins();
  if (allowedOrigins.length === 0) {
    console.warn('[WidgetEvents] Skipping parent message; no trusted parent origin detected');
    return;
  }

  for (const origin of allowedOrigins) {
    try {
      window.parent.postMessage(message, origin);
    } catch (error) {
      console.warn('[WidgetEvents] Failed to notify parent frame', origin, error);
    }
  }
};
