import type { z } from 'zod';
import type { Env } from '../../types.js';
import type { AuthContext } from '../../middleware/auth.js';
import type {
  PracticeAssistantActionSummary,
  PracticeAssistantProgress,
  PracticeAssistantSource,
} from '../../types/wire/practiceAssistant.js';

export type {
  PracticeAssistantActionStatus,
  PracticeAssistantActionSummary,
  PracticeAssistantProgress,
  PracticeAssistantSource,
} from '../../types/wire/practiceAssistant.js';

export type PracticeAssistantRole = 'paralegal' | 'attorney' | 'admin' | 'owner';
export type PracticeAssistantPermissionDecision = 'allow' | 'deny' | 'requires_approval';

export type PracticeValidationResult =
  | { result: true }
  | { result: false; message: string };

export type PracticePermissionResult = {
  decision: PracticeAssistantPermissionDecision;
  reason?: string;
};

export type PracticeToolProgress = {
  label: string;
  status?: PracticeAssistantProgress['status'];
};

export interface PracticeAssistantToolResult {
  toolUseId: string;
  toolName: string;
  ok: boolean;
  data?: unknown;
  error?: string;
  sources?: PracticeAssistantSource[];
  progressLabel?: string;
  action?: PracticeAssistantActionSummary;
}

export interface PracticeAssistantContext {
  env: Env;
  request: Request;
  auth: AuthContext & { memberRole: string };
  practiceId: string;
  practiceSlug?: string | null;
  conversationId: string;
  userId: string;
  signal?: AbortSignal;
  emitProgress: (progress: PracticeAssistantProgress) => void;
}

export interface PracticeAssistantTool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema?: z.ZodType<TOutput>;
  isEnabled: () => boolean;
  isReadOnly: (input: TInput) => boolean;
  isConcurrencySafe: (input: TInput) => boolean;
  isDestructive: (input: TInput) => boolean;
  requiredRole: PracticeAssistantRole;
  validateInput?: (input: TInput, context: PracticeAssistantContext) => Promise<PracticeValidationResult>;
  checkPermissions: (input: TInput, context: PracticeAssistantContext) => Promise<PracticePermissionResult>;
  userFacingName?: (input: TInput) => string;
  getActivityDescription?: (input: TInput) => string;
  renderApprovalSummary?: (input: TInput, context: PracticeAssistantContext) => Promise<Omit<PracticeAssistantActionSummary, 'actionId' | 'toolUseId' | 'toolName' | 'status'>>;
  call: (input: TInput, context: PracticeAssistantContext, toolUseId: string, onProgress?: (progress: PracticeToolProgress) => void) => Promise<Omit<PracticeAssistantToolResult, 'toolUseId' | 'toolName'>>;
}

type PracticeAssistantToolDefaults<TInput> = Pick<
  PracticeAssistantTool<TInput>,
  'isEnabled' | 'isReadOnly' | 'isConcurrencySafe' | 'isDestructive' | 'checkPermissions'
>;

export type PracticeAssistantToolDefinition<TInput = unknown, TOutput = unknown> =
  Omit<PracticeAssistantTool<TInput, TOutput>, keyof PracticeAssistantToolDefaults<TInput>>
  & Partial<PracticeAssistantToolDefaults<TInput>>;

const PRACTICE_TOOL_DEFAULTS: PracticeAssistantToolDefaults<unknown> = {
  isEnabled: () => true,
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  isDestructive: () => false,
  checkPermissions: async () => ({ decision: 'requires_approval' }),
};

export const buildPracticeTool = <TInput, TOutput = unknown>(
  definition: PracticeAssistantToolDefinition<TInput, TOutput>,
): PracticeAssistantTool<TInput, TOutput> => ({
  ...(PRACTICE_TOOL_DEFAULTS as PracticeAssistantToolDefaults<TInput>),
  ...definition,
});

export interface PracticeAssistantToolCall {
  id: string;
  name: string;
  arguments: string;
  index: number;
}

export interface PracticeAssistantTurnMetadata {
  source: 'practice_assistant';
  tools: PracticeAssistantToolResult[];
  progress: PracticeAssistantProgress[];
  sources: PracticeAssistantSource[];
  assistantActions: PracticeAssistantActionSummary[];
  actions: Array<{
    type: 'practice_assistant_decision';
    label: string;
    actionId: string;
    decision: 'approve' | 'reject';
    variant: 'primary' | 'secondary';
  }>;
}
