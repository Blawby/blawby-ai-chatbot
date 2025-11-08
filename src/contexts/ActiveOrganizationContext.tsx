import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { authClient } from '../lib/authClient';
import { DEFAULT_ORGANIZATION_ID } from '../utils/constants';

export interface OrganizationSummary {
  id: string;
  name?: string;
  slug?: string;
}

export interface OrganizationContextValue {
  activeOrgId: string | null;
  setActiveOrg: (orgId: string) => Promise<void>;
  userOrgs: OrganizationSummary[];
  isLoading: boolean;
  error: string | null;
}

export const ActiveOrganizationContext = createContext<OrganizationContextValue | null>(null);

class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();
  runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(() => fn(), () => fn());
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }
}

export function ActiveOrganizationProvider({ children }: { children: ComponentChildren }) {
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [userOrgs, setUserOrgs] = useState<OrganizationSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const mutexRef = useRef(new AsyncMutex());

  const setPublicOrgAsActive = useCallback(async () => {
    try {
      const resp = await fetch('/api/organizations/public', { credentials: 'include' });
      if (resp.ok) {
        const data = await resp.json() as unknown;
        let nextId: string | null = null;
        if (data && typeof data === 'object') {
          const container = data as Record<string, unknown>;
          const payload = (container.data && typeof container.data === 'object')
            ? (container.data as Record<string, unknown>)
            : container;
          const idVal = (payload as Record<string, unknown>).id;
          if (typeof idVal === 'string') nextId = idVal;
        }
        setActiveOrgId(nextId ?? DEFAULT_ORGANIZATION_ID);
      } else {
        setActiveOrgId(DEFAULT_ORGANIZATION_ID);
      }
    } catch {
      setActiveOrgId(DEFAULT_ORGANIZATION_ID);
    }
  }, []);

  const loadUserOrganizations = useCallback(async () => {
    try {
      const resp = await fetch('/api/organizations/me', { credentials: 'include' });
      if (resp.ok) {
        const payload = await resp.json() as unknown;
        let listRaw: unknown = undefined;
        if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
          listRaw = (payload as Record<string, unknown>).data;
        }
        const list = Array.isArray(listRaw) ? listRaw as Array<Record<string, unknown>> : [];
        setUserOrgs(list.map((o) => {
          const obj = o as Record<string, unknown>;
          return {
            id: typeof obj.id === 'string' ? obj.id : String(obj.id ?? ''),
            name: typeof obj.name === 'string' ? obj.name : undefined,
            slug: typeof obj.slug === 'string' ? obj.slug : undefined,
          };
        }));
      }
    } catch {
      // ignore
    }
  }, []);

  const initializeActiveOrg = useCallback(async () => {
    setIsLoading(true);
    try {
      // Restore from localStorage fast
      const stored = typeof window !== 'undefined' ? localStorage.getItem('activeOrgId') : null;
      if (stored) {
        setActiveOrgId(stored);
      }

      // 1. Check auth session
      const authResponse = await fetch('/api/auth/get-session', { credentials: 'include' });
      if (!authResponse.ok) throw new Error('Auth check failed');
      const sessionRaw = await authResponse.json() as unknown;
      const sessionObj = (sessionRaw && typeof sessionRaw === 'object') ? sessionRaw as Record<string, unknown> : {};
      const hasUserId = (val: unknown): val is { user: { id: string } } => {
        if (!val || typeof val !== 'object') return false;
        const v = val as Record<string, unknown>;
        const user = v.user as Record<string, unknown> | undefined;
        return typeof user?.id === 'string' && user.id.length > 0;
      };

      if (hasUserId(sessionObj)) {
        // 2. Resolve default org
        const orgResponse = await fetch('/api/organizations/default', { credentials: 'include' });
        if (orgResponse.ok) {
          const bodyRaw = await orgResponse.json() as unknown;
          let organizationId: string | null = null;
          if (bodyRaw && typeof bodyRaw === 'object') {
            const body = bodyRaw as Record<string, unknown>;
            const data = (body.data && typeof body.data === 'object') ? (body.data as Record<string, unknown>) : null;
            const idFromData = data && typeof data.organizationId === 'string' ? data.organizationId : null;
            const idTop = typeof body.organizationId === 'string' ? body.organizationId : null;
            organizationId = idFromData ?? idTop;
          }
          if (organizationId) {
            setActiveOrgId(organizationId);
          } else {
            await setPublicOrgAsActive();
          }
          // 3. Load user's orgs for switcher
          await loadUserOrganizations();
        } else {
          await setPublicOrgAsActive();
          await loadUserOrganizations();
        }
      } else {
        // Anonymous → public org
        await setPublicOrgAsActive();
        await loadUserOrganizations();
      }
    } catch (e) {
      console.error('Failed to initialize active org:', e);
      setError(e instanceof Error ? e.message : 'Failed to initialize active org');
      setActiveOrgId(DEFAULT_ORGANIZATION_ID);
    } finally {
      setIsLoading(false);
    }
  }, [loadUserOrganizations, setPublicOrgAsActive]);

  useEffect(() => {
    void initializeActiveOrg();
  }, [initializeActiveOrg]);

  // Persist to localStorage
  useEffect(() => {
    if (activeOrgId && typeof window !== 'undefined') {
      try { localStorage.setItem('activeOrgId', activeOrgId); } catch (e) { void e; }
    }
  }, [activeOrgId]);

  useEffect(() => {
    if (!activeOrgId) return;
    /**
     * Better Auth organization API may be unavailable in certain builds or environments.
     * Guard the call at runtime and log failures during development.
     */
    const hasSetActiveOrganization = (client: unknown): client is { organization: { setActiveOrganization: (args: { organizationId: string }) => Promise<unknown> } } => {
      if (!client || typeof client !== 'object') return false;
      const c = client as Record<string, unknown>;
      const org = c.organization as Record<string, unknown> | undefined;
      return typeof org?.setActiveOrganization === 'function';
    };

    const setBA = async () => {
      if (!hasSetActiveOrganization(authClient)) return;
      try {
        await authClient.organization.setActiveOrganization({ organizationId: activeOrgId });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[ActiveOrganization] Failed to notify authClient of active org', err);
      }
    };
    void setBA();
  }, [activeOrgId]);

  const setActiveOrg = useCallback(async (orgId: string) => {
    await mutexRef.current.runExclusive(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const resp = await fetch('/api/sessions/organization', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ organizationId: orgId })
        });
        if (!resp.ok) throw new Error('Failed to switch organization');
        setActiveOrgId(orgId);
      } catch (e) {
        console.error('Failed to switch org:', e);
        setError(e instanceof Error ? e.message : 'Failed to switch organization');
        throw e;
      } finally {
        setIsLoading(false);
      }
    });
  }, []);

  const value = useMemo<OrganizationContextValue>(() => ({
    activeOrgId,
    setActiveOrg,
    userOrgs,
    isLoading,
    error
  }), [activeOrgId, setActiveOrg, userOrgs, isLoading, error]);

  return (
    <ActiveOrganizationContext.Provider value={value}>
      {children}
    </ActiveOrganizationContext.Provider>
  );
}
