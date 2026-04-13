import { useCallback, useMemo } from 'preact/hooks';
import { postSystemMessage } from '@/shared/lib/conversationApi';
import type { ConversationMetadata, SetupFieldsPayload } from '@/shared/types/conversation';
import {
 EMPTY_SETUP_FIELDS,
 applySetupPatchToMetadata,
 resolveSetupFieldsState,
} from '@/shared/utils/setupState';

interface UseSetupFlowOptions {
 enabled?: boolean;
 conversationId: string | undefined;
 practiceId: string | undefined;
 conversationMetadata: ConversationMetadata | null;
 conversationMetadataRef: React.MutableRefObject<ConversationMetadata | null>;
 updateConversationMetadata: (
  patch: ConversationMetadata,
  conversationId?: string,
 ) => Promise<unknown>;
}

export interface UseSetupFlowResult {
 setupFields: SetupFieldsPayload;
 applySetupFields: (payload: Partial<SetupFieldsPayload>, options?: { sendSystemAck?: boolean }) => Promise<void>;
}

const SETUP_FIELD_LABELS: Partial<Record<keyof SetupFieldsPayload, string>> = {
 name: 'Practice name',
 slug: 'Practice URL',
 businessEmail: 'Business email',
 businessPhone: 'Business phone',
 address: 'Address',
 services: 'Services',
 description: 'Description',
 website: 'Website',
};

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
 conversationId,
 practiceId,
 conversationMetadata,
 conversationMetadataRef,
 updateConversationMetadata,
}: UseSetupFlowOptions): UseSetupFlowResult {
 const setupFields = useMemo(
  () => enabled ? resolveSetupFieldsState(conversationMetadata) : EMPTY_SETUP_FIELDS,
  [conversationMetadata, enabled]
 );

 const applySetupFields = useCallback(async (payload: Partial<SetupFieldsPayload>, options?: { sendSystemAck?: boolean }) => {
  if (!enabled) return;

  const delta: Partial<SetupFieldsPayload> = {};
  const changedFields: string[] = [];
  const current = resolveSetupFieldsState(conversationMetadataRef.current);

  PERSISTED_SETUP_FIELD_KEYS.forEach((key: PersistedSetupFieldKey) => {
   switch (key) {
    case 'address': {
     const value = payload.address;
     if (value !== undefined) {
      delta.address = value;
      const label = SETUP_FIELD_LABELS.address;
      if (label) changedFields.push(label);
     }
     break;
    }
    case 'services': {
     const value = payload.services;
     if (value !== undefined) {
      delta.services = value;
      const label = SETUP_FIELD_LABELS.services;
      if (label) changedFields.push(label);
     }
     break;
    }
    default: {
     const value = payload[key];
     if (value !== undefined && current[key] !== value) {
      delta[key] = value;
      const label = SETUP_FIELD_LABELS[key];
      if (label) changedFields.push(label);
     }
    }
   }
  });

  if (Object.keys(delta).length === 0) return;

  await updateConversationMetadata(
   applySetupPatchToMetadata(conversationMetadataRef.current, delta)
  );
  if (options?.sendSystemAck && changedFields.length > 0 && conversationId && practiceId) {
   await postSystemMessage(conversationId, practiceId, {
    clientId: `system-setup-update-${Date.now()}`,
    content: `Updated ${changedFields.join(', ')}`,
    metadata: { setupUpdate: true, fields: changedFields },
   });
  }
 }, [conversationId, conversationMetadataRef, enabled, practiceId, updateConversationMetadata]);

 return {
  setupFields,
  applySetupFields,
 };
}
