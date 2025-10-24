import { useState, useCallback, useEffect } from 'preact/hooks';
import { backendClient } from '../lib/backendClient';
import type { Practice, CreatePracticeData, UpdatePracticeData } from '../types/backend';
import { useSession } from '../contexts/AuthContext';

/**
 * Generates a URL-safe slug from a name string.
 * - Lowercases the input
 * - Trims whitespace
 * - Converts spaces to hyphens
 * - Removes non-alphanumeric characters (except hyphens)
 * - Collapses consecutive hyphens
 * - Strips leading/trailing hyphens
 * - Returns 'organization' if the result is empty
 */
function generateSlug(name: string): string {
  if (!name) return 'organization';
  
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'organization';
}

// Types
export interface Organization {
  id: string;
  slug: string;
  name: string;
  description?: string;
  logo?: string | null;
  metadata?: Record<string, unknown> | null;
  businessPhone?: string | null;
  businessEmail?: string | null;
  consultationFee?: string | null;
  paymentUrl?: string | null;
  calendlyUrl?: string | null;
  stripeCustomerId?: string | null;
  subscriptionTier?: 'free' | 'plus' | 'business' | 'enterprise' | null;
  seats?: number | null;
  config?: {
    metadata?: {
      subscriptionPlan?: string;
      planStatus?: string;
    };
  };
  isPersonal?: boolean | null;
}

export interface CreateOrgData {
  name: string;
  slug?: string; // Optional in interface, but will be auto-generated if not provided
  description?: string;
  businessPhone?: string;
  businessEmail?: string;
  consultationFee?: string;
  paymentUrl?: string;
  calendlyUrl?: string;
}

export interface UpdateOrgData {
  name?: string;
  description?: string;
  businessPhone?: string;
  businessEmail?: string;
  consultationFee?: string;
  paymentUrl?: string;
  calendlyUrl?: string;
}

interface UseOrganizationManagementReturn {
  // Organization CRUD
  organizations: Organization[];
  currentOrganization: Organization | null;
  loading: boolean;
  error: string | null;
  
  // Organization operations
  createOrganization: (data: CreateOrgData) => Promise<Organization>;
  updateOrganization: (id: string, data: UpdateOrgData) => Promise<void>;
  deleteOrganization: (id: string) => Promise<void>;
  
  // Refetch data
  refetch: () => Promise<void>;
}

export function useOrganizationManagement(): UseOrganizationManagementReturn {
  const { data: session, isPending: sessionLoading } = useSession();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper function to map Practice to Organization
  const mapPracticeToOrganization = useCallback((practice: Practice): Organization => {
    const d = practice.practiceDetails;
    return {
      id: practice.id,
      slug: practice.slug,
      name: practice.name,
      description: practice.metadata?.description,
      logo: practice.logo,
      metadata: practice.metadata,
      businessPhone: d?.businessPhone ?? null,
      businessEmail: d?.businessEmail ?? null,
      consultationFee: d?.consultationFee ?? null,
      paymentUrl: d?.paymentUrl ?? null,
      calendlyUrl: d?.calendlyUrl ?? null,
      stripeCustomerId: practice.metadata?.stripeCustomerId || null,
      subscriptionTier: practice.metadata?.subscriptionTier || 'free',
      seats: practice.metadata?.seats || 1,
      config: {
        metadata: {
          subscriptionPlan: practice.metadata?.subscriptionPlan,
          planStatus: practice.metadata?.planStatus
        }
      },
      isPersonal: practice.metadata?.isPersonal || false
    };
  }, []);

  // Helper function to map Organization to Practice data
  const mapOrganizationToPracticeData = useCallback(
    (data: CreateOrgData | UpdateOrgData, opts?: { forCreate?: boolean }): CreatePracticeData | UpdatePracticeData => {
      // Build a partial, then strip undefined safely
      const base: Partial<CreatePracticeData & UpdatePracticeData> = {
        name: data.name,
        // Only auto-generate slug on create; on update, include slug only if explicitly provided
        slug:
          opts?.forCreate
            ? (('slug' in data && data.slug) ? data.slug : generateSlug(data.name))
            : (('slug' in data && data.slug) ? data.slug : undefined),
        businessPhone: data.businessPhone,
        businessEmail: data.businessEmail,
        consultationFee: data.consultationFee,
        paymentUrl: data.paymentUrl,
        calendlyUrl: data.calendlyUrl,
        // Persist description under metadata to align with current backend types
        metadata: data.description ? { description: data.description } : undefined,
      };

      const cleaned = Object.fromEntries(
        Object.entries(base).filter(([, v]) => v !== undefined)
      ) as CreatePracticeData | UpdatePracticeData;

      return cleaned;
    },
    []
  );

  // Fetch organizations for the current user
  const fetchOrganizations = useCallback(async () => {
    if (!session?.user?.id) return;

    setLoading(true);
    setError(null);

    try {
      const response = await backendClient.listPractices();
      
      if (response.practices) {
        const orgs = response.practices.map(mapPracticeToOrganization);
        setOrganizations(orgs);
        
        // Set current organization if not already set
        setCurrentOrganization(prev => {
          if (!prev && orgs.length > 0) {
            return orgs[0];
          }
          return prev;
        });
      } else {
        throw new Error('Failed to fetch practices');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch practices';
      setError(errorMessage);
      console.error('Error fetching practices:', err);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, mapPracticeToOrganization]);

  // Create organization
  const createOrganization = useCallback(async (data: CreateOrgData): Promise<Organization> => {
    setLoading(true);
    setError(null);

    try {
      const practiceData = mapOrganizationToPracticeData(data, { forCreate: true });
      const response = await backendClient.createPractice(practiceData as CreatePracticeData);
      
      const organization = mapPracticeToOrganization(response.practice);
      setOrganizations(prev => [...prev, organization]);
      
      // Set as current organization if it's the first one
      if (organizations.length === 0) {
        setCurrentOrganization(organization);
      }
      
      return organization;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create organization';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [organizations.length, mapOrganizationToPracticeData, mapPracticeToOrganization]);

  // Update organization
  const updateOrganization = useCallback(async (id: string, data: UpdateOrgData): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const practiceData = mapOrganizationToPracticeData(data);
      const response = await backendClient.updatePractice(id, practiceData as UpdatePracticeData);
      
      const updatedOrganization = mapPracticeToOrganization(response.practice);
      setOrganizations(prev => 
        prev.map(org => org.id === id ? updatedOrganization : org)
      );
      
      // Update current organization if it's the one being updated
      if (currentOrganization?.id === id) {
        setCurrentOrganization(updatedOrganization);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update organization';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [currentOrganization?.id, mapOrganizationToPracticeData, mapPracticeToOrganization]);

  // Delete organization
  const deleteOrganization = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      await backendClient.deletePractice(id);
      
      setOrganizations(prev => {
        const remaining = prev.filter(org => org.id !== id);
        
        // Clear current organization if it's the one being deleted
        setCurrentOrganization(curr => {
          if (curr?.id === id) {
            return remaining.length > 0 ? remaining[0] : null;
          }
          return curr;
        });
        
        return remaining;
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete organization';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch all data
  const refetch = useCallback(async () => {
    await fetchOrganizations();
  }, [fetchOrganizations]);

  // Load organizations on mount and when session changes
  useEffect(() => {
    if (session?.user?.id && !sessionLoading) {
      fetchOrganizations();
    }
  }, [session?.user?.id, sessionLoading, fetchOrganizations]);

  return {
    organizations,
    currentOrganization,
    loading,
    error,
    createOrganization,
    updateOrganization,
    deleteOrganization,
    refetch
  };
}