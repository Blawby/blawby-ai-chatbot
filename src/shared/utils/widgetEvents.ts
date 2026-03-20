const parseTrustedParentOriginFromQuery = (): string | null => {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('trusted_parent_origin');
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    if (!isHttp) return null;
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
      origins.add(new URL(referrer).origin);
    } catch {
      // ignore malformed referrer
    }
  }

  // Use (any as type) because location.ancestorOrigins is non-standard but available in some browsers
  // Use cast because location.ancestorOrigins is non-standard but available in some browsers
  const ancestorOrigins = (window.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
  if (ancestorOrigins && ancestorOrigins.length > 0) {
    for (let i = 0; i < ancestorOrigins.length; i += 1) {
      const origin = ancestorOrigins.item(i);
      if (origin) origins.add(origin);
    }
  }

  return Array.from(origins);
};

export const postToParentFrame = (message: unknown) => {
  if (typeof window === 'undefined') return;
  if (window.parent === window) return;

  const allowedOrigins = resolveAllowedParentOrigins();
  if (allowedOrigins.length === 0) {
    console.warn('[WidgetEvents] Skipping parent message; no trusted parent origin detected');
    return;
  }

  try {
    for (const origin of allowedOrigins) {
      window.parent.postMessage(message, origin);
    }
  } catch (error) {
    console.warn('[WidgetEvents] Failed to notify parent frame', error);
  }
};
