import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { renderHook, act } from '@testing-library/preact';
import { useOrganizationManagement } from '../useOrganizationManagement';

// Set up jsdom environment for this test
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
  resources: 'usable'
});

// Use Object.defineProperty to set read-only properties
Object.defineProperty(global, 'window', {
  value: dom.window,
  writable: true
});

Object.defineProperty(global, 'document', {
  value: dom.window.document,
  writable: true
});

Object.defineProperty(global, 'navigator', {
  value: dom.window.navigator,
  writable: true
});

// Set other globals
global.HTMLElement = dom.window.HTMLElement;
global.HTMLAnchorElement = dom.window.HTMLAnchorElement;
global.HTMLButtonElement = dom.window.HTMLButtonElement;
global.HTMLDivElement = dom.window.HTMLDivElement;
global.HTMLSpanElement = dom.window.HTMLSpanElement;
global.HTMLInputElement = dom.window.HTMLInputElement;
global.HTMLFormElement = dom.window.HTMLFormElement;
global.Event = dom.window.Event;
global.EventTarget = dom.window.EventTarget;
global.MessageEvent = dom.window.MessageEvent;
global.DragEvent = dom.window.DragEvent;
global.KeyboardEvent = dom.window.KeyboardEvent;
global.MouseEvent = dom.window.MouseEvent;
global.PointerEvent = dom.window.PointerEvent;
global.TouchEvent = dom.window.TouchEvent;
global.WheelEvent = dom.window.WheelEvent;
global.AnimationEvent = dom.window.AnimationEvent;
global.TransitionEvent = dom.window.TransitionEvent;
global.UIEvent = dom.window.UIEvent;
global.FocusEvent = dom.window.FocusEvent;
global.CompositionEvent = dom.window.CompositionEvent;
global.StorageEvent = dom.window.StorageEvent;

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../lib/apiClient', () => ({
  apiClient: mockApiClient,
}));

vi.mock('../../lib/authClient', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1' } },
    isPending: false,
  }),
}));

vi.mock('../../config/api', async () => {
  const actual = await vi.importActual<typeof import('../../config/api')>('../../config/api');
  return {
    ...actual,
    getOrganizationWorkspaceEndpoint: (orgId: string, resource: string) =>
      `/api/organizations/${orgId}/workspace/${resource}`,
  };
});


describe('useOrganizationManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.get.mockReset();
    mockApiClient.post.mockReset();
    mockApiClient.put.mockReset();
    mockApiClient.patch.mockReset();
    mockApiClient.delete.mockReset();
    mockApiClient.get.mockResolvedValue({ data: { practices: [] } });
  });


  it('loads organizations via the axios client', async () => {
    const practicePayload = {
      data: {
        practices: [
          {
            id: 'org-1',
            name: 'Test Organization',
            slug: 'test-organization',
          },
        ],
      },
    };

    mockApiClient.get.mockResolvedValue(practicePayload);

    const { result } = renderHook(() => useOrganizationManagement());

    await act(async () => {
      await result.current.refetch();
    });

    expect(mockApiClient.get).toHaveBeenCalledWith('/api/practice/list', expect.any(Object));
    expect(result.current.organizations).toHaveLength(1);
    expect(result.current.organizations[0]).toMatchObject({
      id: 'org-1',
      name: 'Test Organization',
    });
  });

  it('creates an organization via POST /api/practice', async () => {
    mockApiClient.post.mockResolvedValueOnce({
      data: {
        id: 'org-new',
        name: 'New Organization',
        slug: 'new-organization',
      },
    });
    mockApiClient.get.mockResolvedValue({
      data: {
        practices: [
          {
            id: 'org-new',
            name: 'New Organization',
            slug: 'new-organization',
          },
        ],
      },
    });

    const { result } = renderHook(() => useOrganizationManagement());

    await act(async () => {
      await result.current.createOrganization({ name: 'New Organization', slug: 'new-organization' });
    });

    expect(mockApiClient.post).toHaveBeenCalledWith('/api/practice', {
      name: 'New Organization',
      slug: 'new-organization',
    });
    expect(result.current.organizations.some(org => org.id === 'org-new')).toBe(true);
  });

  it('uses id as slug when slug is missing from API response', async () => {
    mockApiClient.post.mockResolvedValueOnce({
      data: {
        id: 'org-fallback',
        name: 'Organization Without Slug',
      },
    });
    mockApiClient.get.mockResolvedValue({
      data: {
        practices: [
          {
            id: 'org-fallback',
            name: 'Organization Without Slug',
            // No slug field - should fall back to id
          },
        ],
      },
    });

    const { result } = renderHook(() => useOrganizationManagement());

    await act(async () => {
      const org = await result.current.createOrganization({ name: 'Organization Without Slug' });
      expect(org.slug).toBe('org-fallback'); // Should use id as slug
    });

    expect(result.current.organizations.some(org => org.id === 'org-fallback')).toBe(true);
  });

  it('generates unique slug for special character IDs', async () => {
    // Test scenario: POST returns ID with special characters, GET response lacks slug
    mockApiClient.post.mockResolvedValueOnce({
      data: {
        id: 'org-123@#$%', // Special characters that need sanitization
        name: 'Special Org',
      },
    });
    mockApiClient.get.mockResolvedValue({
      data: {
        practices: [
          {
            id: 'org-123@#$%',
            name: 'Special Org',
            // No slug field - frontend should generate sanitized slug
          },
        ],
      },
    });

    const { result } = renderHook(() => useOrganizationManagement());

    await act(async () => {
      const org = await result.current.createOrganization({ name: 'Special Org' });
      // Should generate a sanitized slug from the ID
      expect(org.slug).toMatch(/^[a-z0-9-]+$/); // Only alphanumeric and hyphens
      expect(org.slug).not.toBe('unknown');
      expect(org.slug).not.toContain('@');
      expect(org.slug).not.toContain('#');
      expect(org.slug).not.toContain('$');
      expect(org.slug).not.toContain('%');
    });
  });

  it('ensures slug is never "unknown" even when validation fails', async () => {
    // Capture the API call payload to inspect the slug value
    let capturedPayload: any = null;
    mockApiClient.post.mockImplementationOnce((url, payload) => {
      capturedPayload = payload;
      return Promise.resolve({
        data: {
          name: 'Organization Without ID or Slug',
        },
      });
    });
    mockApiClient.get.mockResolvedValue({
      data: {
        practices: [],
      },
    });

    const { result } = renderHook(() => useOrganizationManagement());

    await act(async () => {
      // Should throw validation error since id is required, but we check slug first
      await expect(
        result.current.createOrganization({ name: 'Organization Without ID or Slug' })
      ).rejects.toThrow();
    });
    
    // Assert that slug was never set to 'unknown' in the API call
    expect(capturedPayload).toBeTruthy();
    expect(capturedPayload.slug).not.toBe('unknown');
    // Slug should be either undefined or a generated value, but never 'unknown'
    expect(capturedPayload.slug === undefined || typeof capturedPayload.slug === 'string').toBe(true);
  });
});
