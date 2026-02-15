import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import Modal from '@/shared/components/Modal';
import { Button } from '@/shared/ui/Button';
import { Combobox } from '@/shared/ui/input/Combobox';
import { FolderIcon } from '@heroicons/react/24/outline';
import { listMatters, getMatter } from '@/features/matters/services/mattersApi';
import { updateConversationMatter } from '@/shared/lib/apiClient';
import type { Conversation } from '@/shared/types/conversation';

interface WorkspaceMatterOption {
  id: string;
  title: string;
  clientName?: string | null;
  matterType?: string | null;
  status?: string | null;
}

interface LinkMatterModalProps {
  isOpen: boolean;
  onClose: () => void;
  practiceId: string;
  conversationId: string;
  currentMatterId?: string | null;
  onMatterUpdated?: (conversation: Conversation) => void;
}

export const LinkMatterModal = ({
  isOpen,
  onClose,
  practiceId,
  conversationId,
  currentMatterId = null,
  onMatterUpdated
}: LinkMatterModalProps) => {
  const pageSize = 50;
  const [matters, setMatters] = useState<WorkspaceMatterOption[]>([]);
  const [selectedMatterId, setSelectedMatterId] = useState<string>(currentMatterId ?? '');
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'loading-more'>('idle');
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const [currentMatter, setCurrentMatter] = useState<WorkspaceMatterOption | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const matterId = currentMatterId ?? '';
    setSelectedMatterId(matterId);
    setError(null);
    setPage(1);
    const controller = new AbortController();

    // Fetch current matter specifically if we have an ID
    if (matterId) {
      setCurrentMatter(null);
      const fetchCurrent = async () => {
        try {
          const m = await getMatter(practiceId, matterId, { signal: controller.signal });
          if (m && !controller.signal.aborted) {
            setCurrentMatter({
              id: m.id,
              title: m.title ?? 'Untitled Matter',
              clientName: m.client_id ? `Client ${m.client_id.slice(0, 8)}` : null,
              matterType: m.matter_type ?? null,
              status: m.status ?? null
            });
          }
        } catch (err) {
          if ((err as DOMException).name === 'AbortError' || controller.signal.aborted) {
            return;
          }
          setCurrentMatter(null);
          console.warn('[LinkMatterModal] Failed to fetch current matter details', err);
        }
      };
      void fetchCurrent();
    } else {
      setCurrentMatter(null);
    }
    return () => {
      controller.abort();
    };
  }, [currentMatterId, isOpen, practiceId]);

  const fetchMatters = useCallback(async (
    pageToLoad: number,
    { append }: { append: boolean }
  ) => {
    if (!practiceId) {
      setMatters([]);
      setHasMore(false);
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoadingState(append ? 'loading-more' : 'loading');
    setError(null);
    try {
      const results = await listMatters(practiceId, {
        page: pageToLoad,
        limit: pageSize,
        signal: controller.signal
      });

      const normalized = results.map((m) => ({
        id: m.id,
        title: m.title ?? 'Untitled Matter',
        clientName: m.client_id ? `Client ${m.client_id.slice(0, 8)}` : null,
        matterType: m.matter_type ?? null,
        status: m.status ?? null
      }));

      // If we got fewer items than pageSize, we likely reached the end
      const nextHasMore = results.length === pageSize;

      setMatters((prev) => append ? [...prev, ...normalized] : normalized);
      setHasMore(nextHasMore);
      setPage(pageToLoad);
    } catch (err) {
      if ((err as DOMException).name !== 'AbortError') {
        const message = err instanceof Error ? err.message : 'Failed to load matters';
        setError(message);
        if (!append) {
          setMatters([]);
        }
      }
    } finally {
      // Only update state if this request wasn't superseded
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setLoadingState('idle');
      }
    }

  }, [practiceId, pageSize]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    void fetchMatters(1, { append: false });
    return () => {
      controllerRef.current?.abort();
    };
  }, [fetchMatters, isOpen, currentMatterId]);

  const handleLoadMore = async () => {
    if (loadingState !== 'idle' || !hasMore) return;
    await fetchMatters(page + 1, { append: true });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const conversation = await updateConversationMatter(
        conversationId,
        selectedMatterId ? selectedMatterId : null
      );
      onMatterUpdated?.(conversation);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update matter link';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async () => {
    setSaving(true);
    setError(null);
    try {
      const conversation = await updateConversationMatter(conversationId, null);
      onMatterUpdated?.(conversation);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unlink matter';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const isUnchanged = (currentMatterId ?? '') === selectedMatterId;

  const matterOptions = useMemo(() => {
    const list = matters.map((m) => ({
      value: m.id,
      label: m.title,
      meta: m.clientName ?? undefined
    }));

    // Ensure current matter is always an option even if not in the first page of results
    if (currentMatter && !matters.some((m) => m.id === currentMatter.id)) {
      list.unshift({
        value: currentMatter.id,
        label: currentMatter.title,
        meta: currentMatter.clientName ?? undefined
      });
    }

    return list;
  }, [matters, currentMatter]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Link to matter"
      contentClassName="max-w-lg"
    >
      <div className="space-y-4">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          Choose a matter to associate with this conversation. Unlinking removes the association without deleting the
          conversation.
        </div>

        <div className="space-y-4">
          <Combobox
            label="Matter"
            placeholder={loadingState === 'loading' ? 'Loading matters...' : 'Select matter'}
            value={selectedMatterId}
            options={matterOptions}
            onChange={setSelectedMatterId}
            disabled={saving}
            leading={() => <FolderIcon className="h-4 w-4 text-input-placeholder" />}
            optionLeading={() => <FolderIcon className="h-4 w-4 text-input-placeholder" />}
          />
          {loadingState === 'loading' && (
            <div className="text-xs text-gray-500 dark:text-gray-400">Loading matters…</div>
          )}
          {loadingState !== 'loading' && hasMore && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Showing {matters.length} results. Load more to see additional matters.
            </div>
          )}
        </div>

        {error && (
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={saving || loadingState !== 'idle' || isUnchanged}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
          {currentMatterId && (
            <Button
              variant="danger"
              size="sm"
              onClick={handleUnlink}
              disabled={loadingState !== 'idle' || saving}
            >
              Unlink
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>

        {hasMore && (
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleLoadMore}
              disabled={loadingState !== 'idle' || saving}
            >
              {loadingState === 'loading-more' ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
};
