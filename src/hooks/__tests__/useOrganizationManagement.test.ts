import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/preact';
import { useOrganizationManagement } from '../useOrganizationManagement';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
  resources: 'usable'
});

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

global.HTMLElement = dom.window.HTMLElement;
global.MessageEvent = dom.window.MessageEvent;
global.DragEvent = dom.window.DragEvent;
global.KeyboardEvent = dom.window.KeyboardEvent;
global.MouseEvent = dom.window.MouseEvent;
global.PointerEvent = dom.window.PointerEvent;
global.TouchEvent = dom.window.TouchEvent;
global.WheelEvent = dom.window.WheelEvent;

const { mockApiClient, mockPracticeApi } = vi.hoisted(() => ({
  mockApiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  mockPracticeApi: {
    listPractices: vi.fn(),
    createPractice: vi.fn(),
    updatePractice: vi.fn(),
    deletePractice: vi.fn(),
    listPracticeInvitations: vi.fn(),
    createPracticeInvitation: vi.fn(),
    respondToPracticeInvitation: vi.fn(),
    listPracticeMembers: vi.fn(),
    updatePracticeMemberRole: vi.fn(),
    deletePracticeMember: vi.fn(),
    listPracticeTokens: vi.fn(),
    createPracticeToken: vi.fn(),
    deletePracticeToken: vi.fn(),
  }
}));

vi.mock('../../lib/apiClient', () => ({
  apiClient: mockApiClient,
  listPractices: mockPracticeApi.listPractices,
  createPractice: mockPracticeApi.createPractice,
  updatePractice: mockPracticeApi.updatePractice,
  deletePractice: mockPracticeApi.deletePractice,
  listPracticeInvitations: mockPracticeApi.listPracticeInvitations,
  createPracticeInvitation: mockPracticeApi.createPracticeInvitation,
  respondToPracticeInvitation: mockPracticeApi.respondToPracticeInvitation,
  listPracticeMembers: mockPracticeApi.listPracticeMembers,
  updatePracticeMemberRole: mockPracticeApi.updatePracticeMemberRole,
  deletePracticeMember: mockPracticeApi.deletePracticeMember,
  listPracticeTokens: mockPracticeApi.listPracticeTokens,
  createPracticeToken: mockPracticeApi.createPracticeToken,
  deletePracticeToken: mockPracticeApi.deletePracticeToken,
}));

vi.mock('../../lib/authClient', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1', email: 'test@example.com' } },
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
    Object.values(mockApiClient).forEach(fn => fn.mockReset());
    Object.values(mockPracticeApi).forEach(fn => fn.mockReset());
    mockPracticeApi.listPractices.mockResolvedValue([]);
    mockPracticeApi.listPracticeInvitations.mockResolvedValue([]);
    mockPracticeApi.listPracticeMembers.mockResolvedValue([]);
    mockPracticeApi.listPracticeTokens.mockResolvedValue([]);
  });

  it('loads organizations via listPractices helper', async () => {
    mockPracticeApi.listPractices.mockResolvedValueOnce([
      { id: 'org-1', name: 'Test Organization', slug: 'test-organization' }
    ]);

    const { result } = renderHook(() =>
      useOrganizationManagement({
        autoFetchOrganizations: false,
        fetchInvitations: false,
      })
    );

    await act(async () => {
      await result.current.refetch();
    });

    expect(mockPracticeApi.listPractices).toHaveBeenCalled();
    expect(result.current.organizations).toHaveLength(1);
    expect(result.current.organizations[0]).toMatchObject({
      id: 'org-1',
      name: 'Test Organization'
    });
  });

  it('creates an organization through the practice helper API', async () => {
    mockPracticeApi.listPractices.mockResolvedValueOnce([
      { id: 'org-new', name: 'New Organization', slug: 'new-organization' }
    ]);

    mockPracticeApi.createPractice.mockResolvedValueOnce({
      id: 'org-new',
      name: 'New Organization',
      slug: 'new-organization'
    });

    const { result } = renderHook(() =>
      useOrganizationManagement({
        autoFetchOrganizations: false,
        fetchInvitations: false,
      })
    );

    await act(async () => {
      await result.current.createOrganization({ name: 'New Organization', slug: 'New Organization' });
    });

    expect(mockPracticeApi.createPractice).toHaveBeenCalled();
    expect(mockPracticeApi.listPractices).toHaveBeenCalledTimes(1);
  });

  it('throws when attempting to create an organization without a name', async () => {
    const { result } = renderHook(() =>
      useOrganizationManagement({
        autoFetchOrganizations: false,
        fetchInvitations: false,
      })
    );

    await expect(
      act(async () => {
        await result.current.createOrganization({ name: '' });
      })
    ).rejects.toThrow('Organization name is required');
  });
});
