// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePaginatedList } from '@/shared/hooks/usePaginatedList';

type Item = { id: string };

describe('usePaginatedList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the first page once on initial mount', async () => {
    const fetchPage = vi.fn(async () => ({
      items: [{ id: 'item-1' }],
      hasMore: false,
    }));

    const { result } = renderHook(() =>
      usePaginatedList<Item>({
        fetchPage,
        deps: ['practice-1'],
      }),
    );

    await waitFor(() => {
      expect(result.current.items).toEqual([{ id: 'item-1' }]);
    });

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(1, expect.any(AbortSignal));
  });

  it('resets and reloads when deps change after mount', async () => {
    const fetchPage = vi.fn(async () => ({
      items: [{ id: 'item-1' }],
      hasMore: false,
    }));

    const { rerender, result } = renderHook(
      ({ practiceId }) =>
        usePaginatedList<Item>({
          fetchPage,
          deps: [practiceId],
        }),
      { initialProps: { practiceId: 'practice-1' } },
    );

    await waitFor(() => {
      expect(result.current.items).toEqual([{ id: 'item-1' }]);
    });

    await act(async () => {
      rerender({ practiceId: 'practice-2' });
    });

    await waitFor(() => {
      expect(fetchPage).toHaveBeenCalledTimes(2);
    });
  });

  it('does not reset or reload when deps rerender with equivalent values', async () => {
    const fetchPage = vi.fn(async () => ({
      items: [{ id: 'item-1' }],
      hasMore: false,
    }));

    const { rerender, result } = renderHook(
      ({ practiceId }) =>
        usePaginatedList<Item>({
          fetchPage,
          deps: [practiceId],
        }),
      { initialProps: { practiceId: 'practice-1' } },
    );

    await waitFor(() => {
      expect(result.current.items).toEqual([{ id: 'item-1' }]);
    });

    await act(async () => {
      rerender({ practiceId: 'practice-1' });
    });

    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
