import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/preact';
import { useOrganizationManagement } from '../useOrganizationManagement';
import { backendClient } from '../../lib/backendClient';

// Mock feature flags - organization management is disabled
vi.mock('../../config/features', () => ({
  features: {
    enableMultipleOrganizations: false,
  },
  useFeatureFlag: (flag: string) => flag === 'enableMultipleOrganizations' ? false : true,
}));

// Mock the backend client
vi.mock('../../lib/backendClient', () => ({
  backendClient: {
    listPractices: vi.fn(),
    createPractice: vi.fn(),
    updatePractice: vi.fn(),
    deletePractice: vi.fn(),
  },
}));

// Mock the auth context
vi.mock('../../contexts/AuthContext', () => ({
  useSession: () => ({
    data: { user: { id: 'test-user-id' } },
    isPending: false,
  }),
}));

describe('useOrganizationManagement (Feature Flagged Off)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return initial empty state when feature flag is disabled', async () => {
    // Mock empty response for listPractices
    vi.mocked(backendClient.listPractices).mockResolvedValue({
      practices: []
    });

    const { result } = renderHook(() => useOrganizationManagement());

    // Wait for the hook to finish loading
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Verify initial state - hook should still provide the interface
    expect(result.current.organizations).toEqual([]);
    expect(result.current.currentOrganization).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();

    // Verify that the hook provides the expected interface
    expect(typeof result.current.createOrganization).toBe('function');
    expect(typeof result.current.updateOrganization).toBe('function');
    expect(typeof result.current.deleteOrganization).toBe('function');
    expect(typeof result.current.refetch).toBe('function');
  });

  it('should automatically fetch organizations even when feature flag is disabled', async () => {
    // Mock empty response for listPractices
    vi.mocked(backendClient.listPractices).mockResolvedValue({
      practices: []
    });

    const { result } = renderHook(() => useOrganizationManagement());

    // Wait for any potential async operations
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Verify that API calls were made (hook doesn't check feature flag internally)
    expect(backendClient.listPractices).toHaveBeenCalled();
  });

  it('should handle manual API calls when feature flag is disabled', async () => {
    // Mock successful API responses
    vi.mocked(backendClient.listPractices).mockResolvedValue({
      practices: [
        {
          id: 'test-org-1',
          slug: 'test-org',
          name: 'Test Organization',
          logo: null,
          metadata: { description: 'Test org description' },
          practiceDetails: {
            businessPhone: '+1234567890',
            businessEmail: 'test@example.com',
            consultationFee: '15000', // $150.00 in cents
            paymentUrl: 'https://example.com/pay',
            calendlyUrl: 'https://calendly.com/test'
          }
        }
      ]
    });

    const { result } = renderHook(() => useOrganizationManagement());

    // Test that manual operations work (hook doesn't check feature flag internally)
    await expect(result.current.refetch()).resolves.not.toThrow();
    
    // Verify API was called when manually triggered
    expect(backendClient.listPractices).toHaveBeenCalled();
  });

  it('should handle create organization when feature flag is disabled', async () => {
    const mockCreatedPractice = {
      id: 'new-org-id',
      slug: 'new-org',
      name: 'New Organization',
      logo: null,
      metadata: { description: 'New org description' },
      practiceDetails: {
        businessPhone: '+1234567890',
        businessEmail: 'new@example.com',
        consultationFee: '20000',
        paymentUrl: 'https://example.com/new-pay',
        calendlyUrl: 'https://calendly.com/new'
      }
    };

    vi.mocked(backendClient.createPractice).mockResolvedValue({
      practice: mockCreatedPractice
    });

    const { result } = renderHook(() => useOrganizationManagement());

    // Test that create operation works
    await expect(result.current.createOrganization({
      name: 'New Organization',
      description: 'New org description'
    })).resolves.toMatchObject({
      id: 'new-org-id',
      name: 'New Organization'
    });

    // Verify API was called
    expect(backendClient.createPractice).toHaveBeenCalled();
  });

  it('should handle update organization when feature flag is disabled', async () => {
    const mockUpdatedPractice = {
      id: 'test-org-id',
      slug: 'test-org',
      name: 'Updated Organization',
      logo: null,
      metadata: { description: 'Updated description' },
      practiceDetails: {
        businessPhone: '+1234567890',
        businessEmail: 'updated@example.com',
        consultationFee: '25000',
        paymentUrl: 'https://example.com/updated-pay',
        calendlyUrl: 'https://calendly.com/updated'
      }
    };

    vi.mocked(backendClient.updatePractice).mockResolvedValue({
      practice: mockUpdatedPractice
    });

    const { result } = renderHook(() => useOrganizationManagement());

    // Test that update operation works
    await expect(result.current.updateOrganization('test-org-id', {
      name: 'Updated Organization',
      description: 'Updated description'
    })).resolves.not.toThrow();

    // Verify API was called
    expect(backendClient.updatePractice).toHaveBeenCalled();
  });

  it('should handle delete organization when feature flag is disabled', async () => {
    vi.mocked(backendClient.deletePractice).mockResolvedValue({});

    const { result } = renderHook(() => useOrganizationManagement());

    // Test that delete operation works
    await expect(result.current.deleteOrganization('test-org-id')).resolves.not.toThrow();

    // Verify API was called
    expect(backendClient.deletePractice).toHaveBeenCalledWith('test-org-id');
  });

  it('should handle API errors gracefully when feature flag is disabled', async () => {
    const errorMessage = 'API Error';
    vi.mocked(backendClient.listPractices).mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useOrganizationManagement());

    // Wait for the hook to handle the error
    await waitFor(() => {
      expect(result.current.error).toBe(errorMessage);
    });

    // Test that errors are handled properly in the hook state
    expect(result.current.error).toBe(errorMessage);
    expect(result.current.loading).toBe(false);
    
    // Verify API was called
    expect(backendClient.listPractices).toHaveBeenCalled();
  });
});