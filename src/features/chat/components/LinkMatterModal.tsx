import { useEffect, useState } from 'preact/hooks';
import Modal from '@/shared/components/Modal';
import { Button } from '@/shared/ui/Button';
import { getPracticeWorkspaceEndpoint } from '@/config/api';
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
  const [matters, setMatters] = useState<WorkspaceMatterOption[]>([]);
  const [selectedMatterId, setSelectedMatterId] = useState<string>(currentMatterId ?? '');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedMatterId(currentMatterId ?? '');
  }, [currentMatterId]);

  useEffect(() => {
    if (!practiceId) {
      setMatters([]);
      return;
    }

    const controller = new AbortController();
    const loadMatters = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: '100' });
        const endpoint = `${getPracticeWorkspaceEndpoint(practiceId, 'matters')}?${params.toString()}`;
        const response = await fetch(endpoint, {
          method: 'GET',
          credentials: 'include',
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(payload?.error || `Failed to load matters (${response.status})`);
        }

        const payload = await response.json() as { success?: boolean; error?: string; data?: unknown };
        if (payload.success === false) {
          throw new Error(payload.error || 'Failed to load matters');
        }

        const data = (payload && typeof payload === 'object' && 'data' in payload)
          ? (payload as { data?: unknown }).data
          : payload;

        const record = (data && typeof data === 'object') ? data as Record<string, unknown> : null;
        const items = Array.isArray(record?.items)
          ? record?.items
          : Array.isArray(record?.matters)
            ? record?.matters
            : [];

        const normalized = items
          .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
          .map((item) => ({
            id: typeof item.id === 'string' ? item.id : String(item.id ?? ''),
            title: typeof item.title === 'string' ? item.title : 'Untitled Matter',
            clientName: typeof item.clientName === 'string' ? item.clientName : null,
            matterType: typeof item.matterType === 'string' ? item.matterType : null,
            status: typeof item.status === 'string' ? item.status : null
          }))
          .filter((item) => item.id.trim().length > 0);

        setMatters(normalized);
      } catch (err) {
        if ((err as DOMException).name !== 'AbortError') {
          const message = err instanceof Error ? err.message : 'Failed to load matters';
          setError(message);
          setMatters([]);
        }
      } finally {
        setLoading(false);
      }
    };

    void loadMatters();
    return () => controller.abort();
  }, [practiceId]);

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

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200" htmlFor="matter-link-select">
            Matter
          </label>
          <select
            id="matter-link-select"
            value={selectedMatterId}
            onChange={(event) => setSelectedMatterId(event.currentTarget.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card-bg px-3 py-2 text-sm text-gray-900 dark:text-white"
            disabled={loading || saving}
          >
            <option value="">No matter</option>
            {matters.map((matter) => (
              <option key={matter.id} value={matter.id}>
                {matter.title}{matter.clientName ? ` (${matter.clientName})` : ''}
              </option>
            ))}
          </select>
          {loading && (
            <div className="text-xs text-gray-500 dark:text-gray-400">Loading matters…</div>
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
            disabled={saving || loading || isUnchanged}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
          {currentMatterId && (
            <Button
              variant="danger"
              size="sm"
              onClick={handleUnlink}
              disabled={saving}
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
      </div>
    </Modal>
  );
};
