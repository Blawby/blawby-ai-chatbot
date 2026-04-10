import { useCallback, useMemo } from 'preact/hooks';
import type { ConversationMetadata, SetupFieldsPayload } from '@/shared/types/conversation';
import {
  applySetupPatchToMetadata,
  resolveSetupFieldsState,
} from '@/shared/utils/setupState';

interface UseSetupFlowOptions {
  enabled?: boolean;
  conversationMetadata: ConversationMetadata | null;
  conversationMetadataRef: React.MutableRefObject<ConversationMetadata | null>;
  updateConversationMetadata: (
    patch: ConversationMetadata,
    conversationId?: string,
  ) => Promise<unknown>;
}

export interface UseSetupFlowResult {
  setupFields: SetupFieldsPayload;
  applySetupFields: (payload: Partial<SetupFieldsPayload>) => Promise<void>;
}

const PERSISTED_SETUP_FIELD_KEYS = [
  'name',
  'slug',
  'description',
  'accentColor',
  'website',
  'businessEmail',
  'businessPhone',
  'address',
  'services',
] as const satisfies ReadonlyArray<keyof SetupFieldsPayload>;

type PersistedSetupFieldKey = (typeof PERSISTED_SETUP_FIELD_KEYS)[number];

export function useSetupFlow({
  enabled = true,
  conversationMetadata,
  conversationMetadataRef,
  updateConversationMetadata,
}: UseSetupFlowOptions): UseSetupFlowResult {
  const setupFields = useMemo(
    () => resolveSetupFieldsState(conversationMetadata),
    [conversationMetadata]
  );

  const applySetupFields = useCallback(async (payload: Partial<SetupFieldsPayload>) => {
    if (!enabled) return;

    const delta: Partial<SetupFieldsPayload> = {};

    PERSISTED_SETUP_FIELD_KEYS.forEach((key: PersistedSetupFieldKey) => {
      switch (key) {
        case 'address': {
          const value = payload.address;
          if (value !== undefined) {
            delta.address = value;
          }
          break;
        }
        case 'services': {
          const value = payload.services;
          if (value !== undefined) {
            delta.services = value;
          }
          break;
        }
        default: {
          const value = payload[key];
          if (value !== undefined) {
            delta[key] = value;
          }
        }
      }
    });

    if (Object.keys(delta).length === 0) return;

    await updateConversationMetadata(
      applySetupPatchToMetadata(conversationMetadataRef.current, delta)
    );
  }, [conversationMetadataRef, enabled, updateConversationMetadata]);

  return {
    setupFields,
    applySetupFields,
  };
}
