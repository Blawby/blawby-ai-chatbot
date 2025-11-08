import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeMattersResponse, MattersSidebarItem, MattersSidebarStatus } from '../useMattersSidebar';

describe('normalizeMattersResponse', () => {
  let mockLogger: { warn: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockLogger = {
      warn: vi.fn()
    };
  });

  describe('valid data', () => {
    it('should normalize valid matter items correctly', () => {
      const payload = {
        items: [
          {
            id: 'matter-1',
            title: 'Test Matter',
            matterType: 'Family Law',
            status: 'open',
            priority: 'high',
            clientName: 'John Doe',
            leadSource: 'Website',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
            acceptedBy: {
              userId: 'user-123',
              acceptedAt: '2024-01-01T10:00:00Z'
            }
          }
        ]
      };

      const result = normalizeMattersResponse(payload, mockLogger);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'matter-1',
        title: 'Test Matter',
        matterType: 'Family Law',
        status: 'open',
        priority: 'high',
        clientName: 'John Doe',
        leadSource: 'Website',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        acceptedBy: {
          userId: 'user-123',
          acceptedAt: '2024-01-01T10:00:00Z'
        }
      });
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should handle null acceptedBy correctly', () => {
      const payload = {
        items: [
          {
            id: 'matter-1',
            title: 'Test Matter',
            matterType: 'General',
            status: 'lead',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
            acceptedBy: null
          }
        ]
      };

      const result = normalizeMattersResponse(payload, mockLogger);

      expect(result[0].acceptedBy).toBeNull();
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('invalid userId in acceptedBy', () => {
    it('should log warning and set userId to null when userId is empty string', () => {
      const payload = {
        items: [
          {
            id: 'matter-1',
            title: 'Test Matter',
            matterType: 'General',
            status: 'lead',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
            acceptedBy: {
              userId: '',
              acceptedAt: '2024-01-01T10:00:00Z'
            }
          }
        ]
      };

      const result = normalizeMattersResponse(payload, mockLogger);

      expect(result[0].acceptedBy?.userId).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid userId in acceptedBy',
        expect.objectContaining({
          itemId: 'matter-1',
          field: 'acceptedBy.userId',
          value: '',
          type: 'string'
        })
      );
    });

    it('should log warning and set userId to null when userId is non-string', () => {
      const payload = {
        items: [
          {
            id: 'matter-1',
            title: 'Test Matter',
            matterType: 'General',
            status: 'lead',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
            acceptedBy: {
              userId: 123,
              acceptedAt: '2024-01-01T10:00:00Z'
            }
          }
        ]
      };

      const result = normalizeMattersResponse(payload, mockLogger);

      expect(result[0].acceptedBy?.userId).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid userId in acceptedBy',
        expect.objectContaining({
          itemId: 'matter-1',
          field: 'acceptedBy.userId',
          value: 123,
          type: 'number'
        })
      );
    });

    it('should log warning and set userId to null when userId is whitespace-only string', () => {
      const payload = {
        items: [
          {
            id: 'matter-1',
            title: 'Test Matter',
            matterType: 'General',
            status: 'lead',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
            acceptedBy: {
              userId: '   ',
              acceptedAt: '2024-01-01T10:00:00Z'
            }
          }
        ]
      };

      const result = normalizeMattersResponse(payload, mockLogger);

      expect(result[0].acceptedBy?.userId).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('invalid acceptedAt in acceptedBy', () => {
    it('should log warning and set acceptedAt to null when acceptedAt is empty string', () => {
      const payload = {
        items: [
          {
            id: 'matter-1',
            title: 'Test Matter',
            matterType: 'General',
            status: 'lead',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
            acceptedBy: {
              userId: 'user-123',
              acceptedAt: ''
            }
          }
        ]
      };

      const result = normalizeMattersResponse(payload, mockLogger);

      expect(result[0].acceptedBy?.acceptedAt).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid acceptedAt in acceptedBy',
        expect.objectContaining({
          itemId: 'matter-1',
          field: 'acceptedBy.acceptedAt',
          value: '',
          type: 'string'
        })
      );
    });

    it('should log warning and set acceptedAt to null when acceptedAt is non-string', () => {
      const payload = {
        items: [
          {
            id: 'matter-1',
            title: 'Test Matter',
            matterType: 'General',
            status: 'lead',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
            acceptedBy: {
              userId: 'user-123',
              acceptedAt: 12345
            }
          }
        ]
      };

      const result = normalizeMattersResponse(payload, mockLogger);

      expect(result[0].acceptedBy?.acceptedAt).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid acceptedAt in acceptedBy',
        expect.objectContaining({
          itemId: 'matter-1',
          field: 'acceptedBy.acceptedAt',
          value: 12345,
          type: 'number'
        })
      );
    });

    it('should handle null acceptedAt without warning', () => {
      const payload = {
        items: [
          {
            id: 'matter-1',
            title: 'Test Matter',
            matterType: 'General',
            status: 'lead',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
            acceptedBy: {
              userId: 'user-123',
              acceptedAt: null
            }
          }
        ]
      };

      const result = normalizeMattersResponse(payload, mockLogger);

      expect(result[0].acceptedBy?.acceptedAt).toBeNull();
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('invalid status values', () => {
    it('should log warning and default to lead when status is invalid string', () => {
      const payload = {
        items: [
          {
            id: 'matter-1',
            title: 'Test Matter',
            matterType: 'General',
            status: 'invalid_status',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z'
          }
        ]
      };

      const result = normalizeMattersResponse(payload, mockLogger);

      expect(result[0].status).toBe('lead');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid status value',
        expect.objectContaining({
          itemId: 'matter-1',
          field: 'status',
          value: 'invalid_status',
          allowedValues: expect.arrayContaining(['lead', 'open', 'in_progress', 'completed', 'archived'])
        })
      );
    });

    it('should log warning and default to lead when status is non-string', () => {
      const payload = {
        items: [
          {
            id: 'matter-1',
            title: 'Test Matter',
            matterType: 'General',
            status: 123,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z'
          }
        ]
      };

      const result = normalizeMattersResponse(payload, mockLogger);

      expect(result[0].status).toBe('lead');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid status type',
        expect.objectContaining({
          itemId: 'matter-1',
          field: 'status',
          value: 123,
          type: 'number',
          allowedValues: expect.arrayContaining(['lead', 'open', 'in_progress', 'completed', 'archived'])
        })
      );
    });

    it('should accept all valid status values', () => {
      const validStatuses: MattersSidebarStatus[] = ['lead', 'open', 'in_progress', 'completed', 'archived'];
      
      validStatuses.forEach(status => {
        const payload = {
          items: [
            {
              id: `matter-${status}`,
              title: 'Test Matter',
              matterType: 'General',
              status,
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-02T00:00:00Z'
            }
          ]
        };

        const result = normalizeMattersResponse(payload, mockLogger);
        expect(result[0].status).toBe(status);
      });

      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('missing createdAt', () => {
    it('should log warning and set createdAt to null when createdAt is missing', () => {
      const payload = {
        items: [
          {
            id: 'matter-1',
            title: 'Test Matter',
            matterType: 'General',
            status: 'lead',
            updatedAt: '2024-01-02T00:00:00Z'
          }
        ]
      };

      const result = normalizeMattersResponse(payload, mockLogger);

      expect(result[0].createdAt).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Missing createdAt timestamp',
        expect.objectContaining({
          itemId: 'matter-1',
          field: 'createdAt'
        })
      );
    });

    it('should log warning and set createdAt to null when createdAt is undefined', () => {
      const payload = {
        items: [
          {
            id: 'matter-1',
            title: 'Test Matter',
            matterType: 'General',
            status: 'lead',
            createdAt: undefined,
            updatedAt: '2024-01-02T00:00:00Z'
          }
        ]
      };

      const result = normalizeMattersResponse(payload, mockLogger);

      expect(result[0].createdAt).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Missing createdAt timestamp',
        expect.objectContaining({
          itemId: 'matter-1',
          field: 'createdAt'
        })
      );
    });
  });

  describe('invalid createdAt', () => {
    it('should log warning and set createdAt to null when createdAt is empty string', () => {
      const payload = {
        items: [
          {
            id: 'matter-1',
            title: 'Test Matter',
            matterType: 'General',
            status: 'lead',
            createdAt: '',
            updatedAt: '2024-01-02T00:00:00Z'
          }
        ]
      };

      const result = normalizeMattersResponse(payload, mockLogger);

      expect(result[0].createdAt).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid createdAt value',
        expect.objectContaining({
          itemId: 'matter-1',
          field: 'createdAt',
          value: '',
          type: 'string'
        })
      );
    });

    it('should log warning and set createdAt to null when createdAt is non-string', () => {
      const payload = {
        items: [
          {
            id: 'matter-1',
            title: 'Test Matter',
            matterType: 'General',
            status: 'lead',
            createdAt: 12345,
            updatedAt: '2024-01-02T00:00:00Z'
          }
        ]
      };

      const result = normalizeMattersResponse(payload, mockLogger);

      expect(result[0].createdAt).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid createdAt value',
        expect.objectContaining({
          itemId: 'matter-1',
          field: 'createdAt',
          value: 12345,
          type: 'number'
        })
      );
    });

    it('should log warning and set createdAt to null when createdAt is whitespace-only', () => {
      const payload = {
        items: [
          {
            id: 'matter-1',
            title: 'Test Matter',
            matterType: 'General',
            status: 'lead',
            createdAt: '   ',
            updatedAt: '2024-01-02T00:00:00Z'
          }
        ]
      };

      const result = normalizeMattersResponse(payload, mockLogger);

      expect(result[0].createdAt).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('missing updatedAt', () => {
    it('should log warning and set updatedAt to null when updatedAt is missing', () => {
      const payload = {
        items: [
          {
            id: 'matter-1',
            title: 'Test Matter',
            matterType: 'General',
            status: 'lead',
            createdAt: '2024-01-01T00:00:00Z'
          }
        ]
      };

      const result = normalizeMattersResponse(payload, mockLogger);

      expect(result[0].updatedAt).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Missing updatedAt timestamp',
        expect.objectContaining({
          itemId: 'matter-1',
          field: 'updatedAt'
        })
      );
    });

    it('should log warning and set updatedAt to null when updatedAt is undefined', () => {
      const payload = {
        items: [
          {
            id: 'matter-1',
            title: 'Test Matter',
            matterType: 'General',
            status: 'lead',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: undefined
          }
        ]
      };

      const result = normalizeMattersResponse(payload, mockLogger);

      expect(result[0].updatedAt).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Missing updatedAt timestamp',
        expect.objectContaining({
          itemId: 'matter-1',
          field: 'updatedAt'
        })
      );
    });
  });

  describe('invalid updatedAt', () => {
    it('should log warning and set updatedAt to null when updatedAt is empty string', () => {
      const payload = {
        items: [
          {
            id: 'matter-1',
            title: 'Test Matter',
            matterType: 'General',
            status: 'lead',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: ''
          }
        ]
      };

      const result = normalizeMattersResponse(payload, mockLogger);

      expect(result[0].updatedAt).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid updatedAt value',
        expect.objectContaining({
          itemId: 'matter-1',
          field: 'updatedAt',
          value: '',
          type: 'string'
        })
      );
    });

    it('should log warning and set updatedAt to null when updatedAt is non-string', () => {
      const payload = {
        items: [
          {
            id: 'matter-1',
            title: 'Test Matter',
            matterType: 'General',
            status: 'lead',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: 12345
          }
        ]
      };

      const result = normalizeMattersResponse(payload, mockLogger);

      expect(result[0].updatedAt).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid updatedAt value',
        expect.objectContaining({
          itemId: 'matter-1',
          field: 'updatedAt',
          value: 12345,
          type: 'number'
        })
      );
    });
  });

  describe('multiple invalid fields', () => {
    it('should log warnings for all invalid fields in a single item', () => {
      const payload = {
        items: [
          {
            id: 'matter-1',
            title: 'Test Matter',
            matterType: 'General',
            status: 'invalid_status',
            acceptedBy: {
              userId: '',
              acceptedAt: 123
            }
            // createdAt and updatedAt missing
          }
        ]
      };

      const result = normalizeMattersResponse(payload, mockLogger);

      expect(result[0].status).toBe('lead');
      expect(result[0].createdAt).toBeNull();
      expect(result[0].updatedAt).toBeNull();
      expect(result[0].acceptedBy?.userId).toBeNull();
      expect(result[0].acceptedBy?.acceptedAt).toBeNull();

      // Should log warnings for: status, userId, acceptedAt, createdAt, updatedAt
      expect(mockLogger.warn).toHaveBeenCalledTimes(5);
    });
  });

  describe('payload structure', () => {
    it('should handle items array', () => {
      const payload = {
        items: [
          {
            id: 'matter-1',
            title: 'Test Matter',
            matterType: 'General',
            status: 'lead',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z'
          }
        ]
      };

      const result = normalizeMattersResponse(payload, mockLogger);
      expect(result).toHaveLength(1);
    });

    it('should handle matters array', () => {
      const payload = {
        matters: [
          {
            id: 'matter-1',
            title: 'Test Matter',
            matterType: 'General',
            status: 'lead',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z'
          }
        ]
      };

      const result = normalizeMattersResponse(payload, mockLogger);
      expect(result).toHaveLength(1);
    });

    it('should handle empty payload', () => {
      const payload = {};
      const result = normalizeMattersResponse(payload, mockLogger);
      expect(result).toHaveLength(0);
    });

    it('should handle non-array items', () => {
      const badPayload = { items: 'not-an-array' } as unknown as Parameters<typeof normalizeMattersResponse>[0];
      const result = normalizeMattersResponse(badPayload, mockLogger);
      expect(result).toHaveLength(0);
    });
  });
});

