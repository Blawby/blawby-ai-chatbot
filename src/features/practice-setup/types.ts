import type { Address } from '@/shared/types/address';
import type { FileAttachment } from '../../../worker/types';
import type { ChatMessageUI } from '../../../worker/types';
import type { SetupFieldsPayload } from '@/shared/types/conversation';

export interface BasicsFormValues {
  name: string;
  slug: string;
  accentColor: string;
}

export interface ContactFormValues {
  website: string;
  businessEmail: string;
  businessPhone: string;
  address?: Address;
  description?: string;
}

export interface OnboardingProgressSnapshot {
  fields: Partial<SetupFieldsPayload>;
  hasPendingSave: boolean;
  completionScore: number;
  missingFields: string[];
}

export interface OnboardingSaveActionsSnapshot {
  canSave: boolean;
  isSaving: boolean;
  saveError: string | null;
  onSaveAll?: () => void;
}

export interface SetupChatAdapter {
  messages: ChatMessageUI[];
  sendMessage: (
    message: string,
    attachments?: FileAttachment[],
    replyToMessageId?: string | null,
    options?: { additionalContext?: string }
  ) => void | Promise<void>;
  messagesReady?: boolean;
  isSocketReady?: boolean;
  hasMoreMessages?: boolean;
  isLoadingMoreMessages?: boolean;
  onLoadMoreMessages?: () => void | Promise<void>;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onRequestReactions?: (messageId: string) => void | Promise<void>;
}
