import { useCallback } from 'preact/hooks';
import {
  addConversationTag,
  removeConversationTag,
  updateConversationTriage,
} from '@/shared/lib/conversationApi';
import { updateConversationMatter } from '@/shared/lib/apiClient';
import type { Conversation } from '@/shared/types/conversation';
import type { MatterStatus } from '@/shared/types/matterStatus';

type UseWorkspaceInspectorActionsInput = {
  practiceId: string;
  isPracticeWorkspace: boolean;
  selectedConversation: Conversation | null;
  selectedMatterIdFromPath: string | null | undefined;
  refreshConversations: () => void;
  showError: (title: string, message: string) => void;
};

export type WorkspaceInspectorActions = {
  onConversationAssignedToChange: ((assignedTo: string | null) => Promise<void>) | undefined;
  onConversationPriorityChange: ((priority: 'low' | 'normal' | 'high' | 'urgent' | null) => Promise<void>) | undefined;
  onConversationTagsChange: ((nextTags: string[]) => Promise<void>) | undefined;
  onConversationMatterChange: ((matterId: string | null) => Promise<void>) | undefined;
  onMatterStatusChange: (status: MatterStatus) => void;
  onMatterPatchChange: (patch: Record<string, unknown>) => Promise<void>;
};

export function useWorkspaceInspectorActions({
  practiceId,
  isPracticeWorkspace,
  selectedConversation,
  selectedMatterIdFromPath,
  refreshConversations,
  showError,
}: UseWorkspaceInspectorActionsInput): WorkspaceInspectorActions {
  const doAssignedToChange = useCallback(async (assignedTo: string | null) => {
    if (!selectedConversation?.id) return;
    try {
      await updateConversationTriage(selectedConversation.id, practiceId, { assignedTo });
      await refreshConversations();
    } catch {
      showError('Update Failed', 'Failed to update conversation assignment.');
    }
  }, [selectedConversation?.id, practiceId, refreshConversations, showError]);

  const doPriorityChange = useCallback(async (priority: 'low' | 'normal' | 'high' | 'urgent' | null) => {
    if (!selectedConversation?.id) return;
    try {
      await updateConversationTriage(selectedConversation.id, practiceId, { priority });
      await refreshConversations();
    } catch {
      showError('Update Failed', 'Failed to update conversation priority.');
    }
  }, [selectedConversation?.id, practiceId, refreshConversations, showError]);

  const doTagsChange = useCallback(async (nextTags: string[]) => {
    if (!selectedConversation?.id) return;
    try {
      const current = new Set(
        (selectedConversation.tags ?? []).map((t) => t.trim()).filter(Boolean)
      );
      const next = new Set(nextTags.map((t) => t.trim()).filter(Boolean));
      const toAdd = [...next].filter((t) => !current.has(t));
      const toRemove = [...current].filter((t) => !next.has(t));
      for (const tag of toAdd) {
        await addConversationTag(selectedConversation.id, practiceId, tag);
      }
      for (const tag of toRemove) {
        await removeConversationTag(selectedConversation.id, practiceId, tag);
      }
      await refreshConversations();
    } catch {
      showError('Update Failed', 'Failed to update conversation tags.');
    }
  }, [selectedConversation?.id, selectedConversation?.tags, practiceId, refreshConversations, showError]);

  const doMatterChange = useCallback(async (matterId: string | null) => {
    if (!selectedConversation?.id) return;
    try {
      await updateConversationMatter(selectedConversation.id, matterId);
      await refreshConversations();
    } catch {
      showError('Update Failed', 'Failed to link matter to conversation.');
    }
  }, [selectedConversation?.id, refreshConversations, showError]);

  const onMatterStatusChange = useCallback((status: MatterStatus) => {
    if (typeof window === 'undefined' || !selectedMatterIdFromPath) return;
    window.dispatchEvent(
      new CustomEvent('workspace:matter-status-change', {
        detail: { matterId: selectedMatterIdFromPath, status },
      })
    );
  }, [selectedMatterIdFromPath]);

  const onMatterPatchChange = useCallback((patch: Record<string, unknown>): Promise<void> => {
    if (typeof window === 'undefined' || !selectedMatterIdFromPath) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      window.dispatchEvent(
        new CustomEvent('workspace:matter-patch-change', {
          detail: { matterId: selectedMatterIdFromPath, patch, resolve, reject },
        })
      );
    });
  }, [selectedMatterIdFromPath]);

  return {
    onConversationAssignedToChange: isPracticeWorkspace ? doAssignedToChange : undefined,
    onConversationPriorityChange: isPracticeWorkspace ? doPriorityChange : undefined,
    onConversationTagsChange: isPracticeWorkspace ? doTagsChange : undefined,
    onConversationMatterChange: isPracticeWorkspace ? doMatterChange : undefined,
    onMatterStatusChange,
    onMatterPatchChange,
  };
}
