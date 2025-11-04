import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrganizationService } from '../../../worker/services/OrganizationService.js';
import type { Env } from '../../../worker/types.js';

// Mock environment
const mockEnv: Env = {
  DB: {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [] }),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } })
      })
    })
  } as any,
  AI: {} as any,
  CHAT_SESSIONS: {} as any,
  RESEND_API_KEY: 'test-key',
  DOC_EVENTS: {} as any,
  PARALEGAL_TASKS: {} as any,
} as Env;

// Mock crypto.randomUUID
const mockRandomUUID = vi.fn(() => 'test-uuid-123');
if (globalThis.crypto && globalThis.crypto.randomUUID) {
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(mockRandomUUID);
} else {
  // If crypto doesn't exist, create it
  (globalThis as any).crypto = {
    randomUUID: mockRandomUUID
  };
}

describe('OrganizationService - Personal Organization', () => {
  let organizationService: OrganizationService;
  let mockPrepare: ReturnType<typeof vi.fn>;
  let mockBind: ReturnType<typeof vi.fn>;
  let mockFirst: ReturnType<typeof vi.fn>;
  let mockRun: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create fresh mocks for each test
    mockRun = vi.fn();
    mockFirst = vi.fn();
    mockBind = vi.fn().mockReturnValue({
      first: mockFirst,
      run: mockRun
    });
    mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
    
    mockEnv.DB.prepare = mockPrepare;
    organizationService = new OrganizationService(mockEnv);
  });

  describe('createPersonalOrganizationForUser', () => {
    it('should create a personal organization with correct metadata', async () => {
      const userId = 'user-123';
      const userName = 'Test User';
      const orgId = 'test-org-id-123';
      
      // Mock the createOrganization path
      // Call 1: INSERT organizations - mockRun
      mockRun.mockResolvedValueOnce({ success: true, meta: { changes: 1 } });
      
      // Call 2: verification query after insert (returns org ID) - mockFirst
      mockFirst.mockResolvedValueOnce({ id: orgId });
      
      // Call 3: INSERT members - mockRun
      mockRun.mockResolvedValueOnce({ success: true, meta: { changes: 1 } });

      const org = await organizationService.createPersonalOrganizationForUser(userId, userName);

      expect(org).toBeDefined();
      expect(org.kind).toBe('personal');
      expect(org.subscriptionStatus).toBe('none');
      expect(org.subscriptionTier).toBe('free');
      expect(org.seats).toBe(1);
      expect(org.name).toContain(userName);
    });

    it('should create owner membership in members table', async () => {
      const userId = 'user-456';
      const userName = 'Test User';
      const orgId = 'test-org-id-456';
      
      mockRun.mockResolvedValueOnce({ success: true, meta: { changes: 1 } });
      mockFirst.mockResolvedValueOnce({ id: orgId }); // Verification query
      mockRun.mockResolvedValueOnce({ success: true, meta: { changes: 1 } });

      await organizationService.createPersonalOrganizationForUser(userId, userName);

      // Verify member insert was called
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO members')
      );
      expect(mockBind).toHaveBeenCalledWith(
        expect.any(String), // UUID
        expect.any(String), // organization.id
        userId,
        expect.any(Number) // timestamp
      );
    });

    it('should handle member insert failure with rollback', async () => {
      const userId = 'user-789';
      const userName = 'Test User';
      const orgId = 'test-org-id-789';
      
      // Mock organization insert success
      mockRun.mockResolvedValueOnce({ success: true, meta: { changes: 1 } });
      
      // Mock verification query after insert
      mockFirst.mockResolvedValueOnce({ id: orgId });
      
      // Mock member insert failure (throws error)
      mockRun.mockRejectedValueOnce(new Error('Member insert failed'));
      
      // Mock deleteOrganization call for rollback
      // deleteOrganization calls getOrganization first, then DELETE
      mockFirst.mockResolvedValueOnce({
        id: orgId,
        name: 'Test Org',
        slug: 'test-org',
        config: JSON.stringify({}),
        is_personal: 1,
        subscription_tier: 'free',
        seats: 1,
        subscription_status: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      mockRun.mockResolvedValueOnce({ success: true, meta: { changes: 1 } });
      mockFirst.mockResolvedValueOnce(null); // Verification after delete

      await expect(
        organizationService.createPersonalOrganizationForUser(userId, userName)
      ).rejects.toThrow();

      // Verify rollback attempt (deleteOrganization should be called)
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM organizations')
      );
    });
  });

  describe('ensurePersonalOrganization', () => {
    it('should return existing personal org when one exists', async () => {
      const userId = 'user-existing';
      const userName = 'Existing User';
      
      // Mock existing personal org query
      mockFirst.mockResolvedValueOnce({ id: 'existing-org-id' });
      
      // Mock the getOrganization query (SELECT from organizations)
      mockFirst.mockResolvedValueOnce({
        id: 'existing-org-id',
        name: 'Existing User\'s Organization',
        slug: 'existing-user-org',
        config: JSON.stringify({}),
        is_personal: 1,
        subscription_tier: 'free',
        seats: 1,
        subscription_status: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      const org = await organizationService.ensurePersonalOrganization(userId, userName);

      expect(org).toBeDefined();
      expect(org.id).toBe('existing-org-id');
      expect(org.kind).toBe('personal');
      expect(org.subscriptionStatus).toBe('none');
    });

    it('should create new personal org when none exists', async () => {
      const userId = 'user-new';
      const userName = 'New User';
      const orgId = 'test-org-id-new';
      
      // Mock no existing personal org
      mockFirst.mockResolvedValueOnce(null);
      
      // Mock createOrganization path
      mockRun.mockResolvedValueOnce({ success: true, meta: { changes: 1 } });
      mockFirst.mockResolvedValueOnce({ id: orgId }); // Verification query
      mockRun.mockResolvedValueOnce({ success: true, meta: { changes: 1 } });

      const org = await organizationService.ensurePersonalOrganization(userId, userName);

      expect(org).toBeDefined();
      expect(org.kind).toBe('personal');
      expect(org.subscriptionStatus).toBe('none');
    });

    it('should ensure owner membership exists when org found', async () => {
      const userId = 'user-membership';
      const userName = 'Membership User';
      
      // Mock existing personal org
      mockFirst.mockResolvedValueOnce({ id: 'existing-org-id' });
      
      // Mock getOrganization
      mockFirst.mockResolvedValueOnce({
        id: 'existing-org-id',
        name: 'Membership User\'s Organization',
        slug: 'membership-user-org',
        config: JSON.stringify({}),
        is_personal: 1,
        subscription_tier: 'free',
        seats: 1,
        subscription_status: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
      // Mock membership check (returns null - no membership)
      mockFirst.mockResolvedValueOnce(null);
      
      // Mock membership insert
      mockRun.mockResolvedValueOnce({ success: true, meta: { changes: 1 } });

      await organizationService.ensurePersonalOrganization(userId, userName);

      // Verify membership insert was attempted
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO members')
      );
    });
  });

  describe('deriveKind logic', () => {
    it('should derive kind as "personal" when isPersonal is true', async () => {
      const userId = 'user-kind-test';
      const userName = 'Kind Test User';
      const orgId = 'test-org-id-kind';
      
      mockRun.mockResolvedValueOnce({ success: true, meta: { changes: 1 } });
      mockFirst.mockResolvedValueOnce({ id: orgId }); // Verification query
      mockRun.mockResolvedValueOnce({ success: true, meta: { changes: 1 } });

      const org = await organizationService.createPersonalOrganizationForUser(userId, userName);

      expect(org.isPersonal).toBe(true);
      expect(org.kind).toBe('personal');
    });

    it('should derive kind as "business" when isPersonal is false', async () => {
      // Since updateOrganization prevents changing isPersonal, we test via direct DB query simulation
      // This tests the deriveKind method indirectly through getOrganization
      const orgId = 'business-org-id';
      
      // Mock a business org (is_personal = 0)
      mockFirst.mockResolvedValueOnce({
        id: orgId,
        name: 'Business Org',
        slug: 'business-org',
        config: JSON.stringify({}),
        is_personal: 0,
        subscription_tier: 'business',
        seats: 10,
        subscription_status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      const org = await organizationService.getOrganization(orgId);

      expect(org).toBeDefined();
      expect(org?.kind).toBe('business');
    });
  });

  describe('subscription status normalization', () => {
    it('should return "none" when subscription_status is NULL', async () => {
      const userId = 'user-status-test';
      const userName = 'Status Test User';
      const orgId = 'test-org-id-status';
      
      mockRun.mockResolvedValueOnce({ success: true, meta: { changes: 1 } });
      mockFirst.mockResolvedValueOnce({ id: orgId }); // Verification query
      mockRun.mockResolvedValueOnce({ success: true, meta: { changes: 1 } });

      const org = await organizationService.createPersonalOrganizationForUser(userId, userName);

      expect(org.subscriptionStatus).toBe('none');
    });
  });
});

