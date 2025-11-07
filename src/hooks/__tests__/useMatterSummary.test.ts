import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { renderHook, act } from '@testing-library/preact';
import { useMatterSummary } from '../useMatterSummary';
import { Window as HappyDomWindow } from 'happy-dom';

describe('useMatterSummary', () => {
  const originalFetch = globalThis.fetch;
  beforeAll(() => {
    const dom = new HappyDomWindow();
    Object.defineProperty(globalThis, 'window', { value: dom, configurable: true });
    Object.defineProperty(globalThis, 'document', { value: dom.document, configurable: true });
    Object.defineProperty(globalThis, 'navigator', { value: dom.navigator, configurable: true });
  });

  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it('fetches matter summary when identifiers are provided', async () => {
    const mockMatter = {
      id: 'matter-1',
      title: 'Family Consultation',
      matterType: 'Family Law',
      status: 'lead',
      priority: 'high',
      clientName: 'Jane Doe',
      leadSource: 'Website',
      matterNumber: 'MAT-001',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
      acceptedBy: null
    };

    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { matter: mockMatter } })
    });

    const { result } = renderHook(() => useMatterSummary('org-1', 'matter-1'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/organizations/org-1/workspace/matters/matter-1'),
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    );
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.matter).toMatchObject({
      id: 'matter-1',
      matterType: 'Family Law',
      status: 'lead',
      clientName: 'Jane Doe',
      matterNumber: 'MAT-001'
    });
  });

  it('captures errors when the server response is not ok', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({})
    });

    const { result } = renderHook(() => useMatterSummary('org-1', 'matter-1'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.matter).toBeNull();
    expect(result.current.error).toContain('500');
  });

  it('does not attempt to fetch when identifiers are missing', async () => {
    const fetchSpy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    const { result } = renderHook(() => useMatterSummary(undefined, null));

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.matter).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
