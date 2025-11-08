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

export function ActiveOrganizationProvider({ children }: { children: ComponentChildren }) {
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [userOrgs, setUserOrgs] = useState<OrganizationSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const switchingRef = useRef(false);

  const setPublicOrgAsActive = useCallback(async () => {
    try {
      const resp = await fetch('/api/organizations/public', { credentials: 'include' });
      if (resp.ok) {
        const data = await resp.json() as any;
        const org = (data && 'data' in data) ? (data as any).data : data;
        setActiveOrgId(org?.id ?? DEFAULT_ORGANIZATION_ID);
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
        const payload = await resp.json() as any;
        const list = ((payload && payload.data) ? payload.data : []) as Array<{ id: string; name?: string; slug?: string }>;
        setUserOrgs(list.map(o => ({ id: o.id, name: o.name, slug: o.slug })));
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
      const session = await authResponse.json() as any;

      if (session && session.user && session.user.id) {
        // 2. Resolve default org
        const orgResponse = await fetch('/api/organizations/default', { credentials: 'include' });
        if (orgResponse.ok) {
          const body = await orgResponse.json() as any;
          const organizationId = (body && body.data && body.data.organizationId) ? body.data.organizationId : (body?.organizationId ?? null);
          if (organizationId) {
            setActiveOrgId(organizationId);
          } else {
            await setPublicOrgAsActive();
          }
          // 3. Load user's orgs for switcher
          await loadUserOrganizations();
        } else {
          await setPublicOrgAsActive();
        }
      } else {
        // Anonymous → public org
        await setPublicOrgAsActive();
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
      try { localStorage.setItem('activeOrgId', activeOrgId); } catch {}
    }
  }, [activeOrgId]);

  useEffect(() => {
    if (!activeOrgId) return;
    /**
     * Better Auth organization API may be unavailable in certain builds or environments.
     * Guard the call at runtime and log failures during development.
     */
    const hasSetActiveOrganization = (client: unknown): client is { organization: { setActiveOrganization: (args: { organizationId: string }) => Promise<unknown> } } => {
      return Boolean((client as any)?.organization?.setActiveOrganization) && typeof (client as any).organization.setActiveOrganization === 'function';
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
    if (switchingRef.current) {
      throw new Error('Organization switch already in progress');
    }
    switchingRef.current = true;
    setIsLoading(true);
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
      switchingRef.current = false;
    }
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
