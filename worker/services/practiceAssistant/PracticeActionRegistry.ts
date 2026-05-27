// Re-exports preserved for import compatibility during migration.
// New code should import directly from EntityRegistry.
export {
  validateActionPayload as validatePracticeAssistantAction,
  actionPayloadSchema as practiceAssistantActionSchema,
  deriveActionCopy as derivePracticeAssistantActionCopy,
  ENTITY_REGISTRY,
  getEntityConfig,
} from './EntityRegistry.js';
export type { ActionPayload as PracticeAssistantActionPayload } from './EntityRegistry.js';
