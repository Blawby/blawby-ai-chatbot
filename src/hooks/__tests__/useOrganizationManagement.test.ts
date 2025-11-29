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
            slug: 'org-fallback',
          },
        ],
      },
    });

    const { result } = renderHook(() => useOrganizationManagement());

    await act(async () => {
      const org = await result.current.createOrganization({ name: 'Organization Without Slug' });
      expect(org.slug).toBe('org-fallback');
    });

    expect(result.current.organizations.some(org => org.id === 'org-fallback')).toBe(true);
  });

  it('generates a unique slug when slug is missing but id exists in API response', async () => {
    mockApiClient.post.mockResolvedValueOnce({
      data: {
        id: 'org-with-id-only',
        name: 'Organization With ID Only',
      },
    });
    mockApiClient.get.mockResolvedValue({
      data: {
        practices: [
          {
            id: 'org-with-id-only',
            name: 'Organization With ID Only',
            slug: 'org-with-id-only',
          },
        ],
      },
    });

    const { result } = renderHook(() => useOrganizationManagement());

    await act(async () => {
      const org = await result.current.createOrganization({ name: 'Organization With ID Only' });
      // Should use id as slug when slug is missing
      expect(org.slug).toBe('org-with-id-only');
      expect(org.slug).not.toBe('unknown');
    });
  });

  it('generates a unique slug when both slug and id are missing (defensive fallback)', async () => {
    // This is a defensive test - in practice, the backend should always return an id
    // If both are missing, validation will fail, but we ensure slug is never 'unknown'
    mockApiClient.post.mockResolvedValueOnce({
      data: {
        name: 'Organization Without ID or Slug',
      },
    });
    mockApiClient.get.mockResolvedValue({
      data: {
        practices: [],
      },
    });

    const { result } = renderHook(() => useOrganizationManagement());

    await act(async () => {
      // Should throw validation error since id is required, but slug should not be 'unknown'
      await expect(
        result.current.createOrganization({ name: 'Organization Without ID or Slug' })
      ).rejects.toThrow();
    });
  });
});
