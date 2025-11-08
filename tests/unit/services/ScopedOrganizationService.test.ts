import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScopedOrganizationService } from '../../../worker/services/ScopedOrganizationService.js';
import type { Env } from '../../../worker/types.js';
import type { D1Database, Ai, KVNamespace, Queue } from '@cloudflare/workers-types';

// Mock environment
const mockEnv: Env = {
  DB: {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [] }),
        first: vi.fn().mockResolvedValue(null)
      })
    })
  } as unknown as D1Database,
  AI: {} as unknown as Ai,
  CHAT_SESSIONS: {} as unknown as KVNamespace,
  RESEND_API_KEY: 'test-key',
  DOC_EVENTS: {} as unknown as Queue,
  PARALEGAL_TASKS: {} as unknown as Queue,
} as Env;

// Mock services
vi.mock('../../../worker/services/OrganizationService.js', () => ({
  OrganizationService: vi.fn().mockImplementation(() => ({
    getOrganization: vi.fn().mockResolvedValue({ id: 'test-org', name: 'Test Org' }),
    getOrganizationConfig: vi.fn().mockResolvedValue({ name: 'Test Org' })
  }))
}));

vi.mock('../../../worker/services/SessionService.js', () => ({
  SessionService: {
    resolveSession: vi.fn(),
    getSessionById: vi.fn(),
    createSession: vi.fn()
  }
}));

vi.mock('../../../worker/services/ActivityService.js', () => ({
  ActivityService: vi.fn().mockImplementation(() => ({
    createActivity: vi.fn(),
    getActivities: vi.fn()
  }))
}));

vi.mock('../../../worker/services/StatusService.js', () => ({
  StatusService: vi.fn().mockImplementation(() => ({
    createStatus: vi.fn(),
    getStatuses: vi.fn()
  }))
}));

describe('ScopedOrganizationService', () => {
  let scopedService: ScopedOrganizationService;

  beforeEach(() => {
    vi.clearAllMocks();
    scopedService = new ScopedOrganizationService('test-org', mockEnv);
  });

  describe('Basic functionality', () => {
    it('should return the organization ID', () => {
      expect(scopedService.getOrganizationId()).toBe('test-org');
    });

    it('should return the environment', () => {
      expect(scopedService.getEnv()).toBe(mockEnv);
    });
  });

  describe('Organization operations', () => {
    it('should get organization details', async () => {
      const org = await scopedService.getOrganization();
      expect(org).toBeDefined();
    });

    it('should get organization configuration', async () => {
      const config = await scopedService.getOrganizationConfig();
      expect(config).toBeDefined();
    });
  });

  describe('Scoped service creation', () => {
    it('should create scoped session service', () => {
      const sessionService = scopedService.createSessionService();
      expect(sessionService).toBeDefined();
      expect(sessionService.getOrganizationId()).toBe('test-org');
    });

    it('should create scoped activity service', () => {
      const activityService = scopedService.createActivityService();
      expect(activityService).toBeDefined();
    });

    it('should create scoped status service', () => {
      const statusService = scopedService.createStatusService();
      expect(statusService).toBeDefined();
    });
  });

  describe('Database query helpers', () => {
    it('should add organization filter to queries without WHERE clause', async () => {
      const mockResults = [{ id: 1, name: 'test' }];
      const mockAll = vi.fn().mockResolvedValue({ results: mockResults });
      const mockBind = vi.fn().mockReturnValue({ all: mockAll });
      const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
      
      mockEnv.DB.prepare = mockPrepare;

      const results = await scopedService.queryWithOrganization('SELECT * FROM matters');
      
      expect(mockPrepare).toHaveBeenCalledWith('SELECT * FROM matters WHERE organization_id = ?');
      expect(mockBind).toHaveBeenCalledWith('test-org');
      expect(results).toEqual(mockResults);
    });

    it('should add organization filter to queries with WHERE clause', async () => {
      const mockResults = [{ id: 1, name: 'test' }];
      const mockAll = vi.fn().mockResolvedValue({ results: mockResults });
      const mockBind = vi.fn().mockReturnValue({ all: mockAll });
      const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
      
      mockEnv.DB.prepare = mockPrepare;

      const results = await scopedService.queryWithOrganization(
        'SELECT * FROM matters WHERE status = ?',
        ['active']
      );
      
      expect(mockPrepare).toHaveBeenCalledWith('SELECT * FROM matters WHERE status = ? AND organization_id = ?');
      expect(mockBind).toHaveBeenCalledWith('active', 'test-org');
      expect(results).toEqual(mockResults);
    });

    it('should handle single query with organization filter', async () => {
      const mockResult = { id: 1, name: 'test' };
      const mockFirst = vi.fn().mockResolvedValue(mockResult);
      const mockBind = vi.fn().mockReturnValue({ first: mockFirst });
      const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
      
      mockEnv.DB.prepare = mockPrepare;

      const result = await scopedService.queryOneWithOrganization('SELECT * FROM matters WHERE id = ?', ['123']);
      
      expect(mockPrepare).toHaveBeenCalledWith('SELECT * FROM matters WHERE id = ? AND organization_id = ?');
      expect(mockBind).toHaveBeenCalledWith('123', 'test-org');
      expect(result).toEqual(mockResult);
    });
  });
});
