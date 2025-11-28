import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { renderHook, act } from '@testing-library/preact';
import { useOrganizationManagement } from '../useOrganizationManagement';

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

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('useOrganizationManagement (practice API)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.get.mockReset();
    mockApiClient.post.mockReset();
    mockApiClient.put.mockReset();
    mockApiClient.patch.mockReset();
    mockApiClient.delete.mockReset();
    mockApiClient.get.mockResolvedValue({ data: { practices: [] } });
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    } as Response);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('loads practices via the axios client', async () => {
    const practicePayload = {
      data: {
        practices: [
          {
            id: 'org-1',
            name: 'Test Practice',
            slug: 'test-practice',
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
      name: 'Test Practice',
    });
  });

  it('creates a practice via POST /api/practice', async () => {
    mockApiClient.post.mockResolvedValueOnce({
      data: {
        id: 'org-new',
        name: 'New Practice',
        slug: 'new-practice',
      },
    });
    mockApiClient.get.mockResolvedValue({
      data: {
        practices: [
          {
            id: 'org-new',
            name: 'New Practice',
            slug: 'new-practice',
          },
        ],
      },
    });

    const { result } = renderHook(() => useOrganizationManagement());

    await act(async () => {
      await result.current.createOrganization({ name: 'New Practice', slug: 'new-practice' });
    });

    expect(mockApiClient.post).toHaveBeenCalledWith('/api/practice', {
      name: 'New Practice',
      slug: 'new-practice',
    });
    expect(result.current.organizations.some(org => org.id === 'org-new')).toBe(true);
  });
});
