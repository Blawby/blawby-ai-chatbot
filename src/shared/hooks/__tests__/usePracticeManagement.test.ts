import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/preact';
import { usePracticeManagement } from '../usePracticeManagement';
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
    updatePracticeDetails: vi.fn(),
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

vi.mock('@/shared/lib/apiClient', () => ({
  apiClient: mockApiClient,
  listPractices: mockPracticeApi.listPractices,
  createPractice: mockPracticeApi.createPractice,
  updatePractice: mockPracticeApi.updatePractice,
  updatePracticeDetails: mockPracticeApi.updatePracticeDetails,
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

vi.mock('@/shared/lib/authClient', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1', email: 'test@example.com' } },
    isPending: false,
  }),
  useTypedSession: () => ({
    data: { user: { id: 'user-1', email: 'test@example.com' }, session: { id: 'session-1' } },
    isPending: false,
    error: null,
  }),
  useActiveMemberRole: () => ({
    data: { role: 'owner' },
    isPending: false,
    isRefetching: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/shared/contexts/SessionContext', () => ({
  useSessionContext: () => ({
    session: { user: { id: 'user-1', email: 'test@example.com' } },
    isPending: false,
    isAnonymous: false,
    activePracticeId: 'practice-1',
  })
}));

vi.mock('@/config/api', async () => {
  const actual = await vi.importActual<typeof import('@/config/api')>('@/config/api');
  return {
    ...actual,
    getPracticeWorkspaceEndpoint: (practiceId: string, resource: string) =>
      `/api/practices/${practiceId}/workspace/${resource}`,
  };
});


describe('usePracticeManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(mockApiClient).forEach(fn => fn.mockReset());
    Object.values(mockPracticeApi).forEach(fn => fn.mockReset());
    mockPracticeApi.listPractices.mockResolvedValue([]);
    mockPracticeApi.listPracticeInvitations.mockResolvedValue([]);
    mockPracticeApi.listPracticeMembers.mockResolvedValue([]);
    mockPracticeApi.listPracticeTokens.mockResolvedValue([]);
    mockPracticeApi.updatePracticeDetails.mockResolvedValue(null);
  });

  it('loads practices via listPractices helper', async () => {
    mockPracticeApi.listPractices.mockResolvedValueOnce([
      { id: 'practice-1', name: 'Test Practice', slug: 'test-practice' }
    ]);

    const { result } = renderHook(() =>
      usePracticeManagement({
        autoFetchPractices: false,
        fetchInvitations: false,
      })
    );

    await act(async () => {
      await result.current.refetch();
    });

    expect(mockPracticeApi.listPractices).toHaveBeenCalled();
    expect(result.current.practices).toHaveLength(1);
    expect(result.current.practices[0]).toMatchObject({
      id: 'practice-1',
      name: 'Test Practice'
    });
  });

  it('creates a practice through the practice helper API', async () => {
    mockPracticeApi.listPractices.mockResolvedValueOnce([
      { id: 'practice-new', name: 'New Practice', slug: 'new-practice' }
    ]);

    mockPracticeApi.createPractice.mockResolvedValueOnce({
      id: 'practice-new',
      name: 'New Practice',
      slug: 'new-practice'
    });

    const { result } = renderHook(() =>
      usePracticeManagement({
        autoFetchPractices: false,
        fetchInvitations: false,
      })
    );

    await act(async () => {
      await result.current.createPractice({ name: 'New Practice', slug: 'New Practice' });
    });

    expect(mockPracticeApi.createPractice).toHaveBeenCalled();
    expect(mockPracticeApi.updatePracticeDetails).toHaveBeenCalledWith('practice-new', { isPublic: true });
  });

  it('throws when attempting to create a practice without a name', async () => {
    const { result } = renderHook(() =>
      usePracticeManagement({
        autoFetchPractices: false,
        fetchInvitations: false,
      })
    );

    await expect(
      act(async () => {
        await result.current.createPractice({ name: '' });
      })
    ).rejects.toThrow('Practice name is required');
  });
});
