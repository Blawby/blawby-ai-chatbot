import type { ChatMessageUI, FileAttachment } from '../../../../worker/types';

export type DeliveryState = 'sending' | 'sent' | 'delivered' | 'error';

export interface MockMessage extends ChatMessageUI {
  metadata?: Record<string, unknown> & {
    deliveryState?: DeliveryState;
    avatar?: { src?: string | null; name: string };
  };
}

export interface MockChatState {
  messages: MockMessage[];
  conversationId: string | null;
  status: 'ready' | 'submitting' | 'streaming' | 'error';
  isTyping: boolean;
  errorMessage: string | null;
  simulationSpeed: number;
  simulateDeliveryDelay: boolean;
  simulateTyping: boolean;
}

export interface DebugEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface ScenarioStep {
  type: 'user' | 'practice_member';
  content: string;
  delay?: number;
  attachments?: FileAttachment[];
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  steps: ScenarioStep[];
}

export interface UseMockChatResult {
  state: MockChatState;
  debugEvents: DebugEvent[];
  previewFiles: FileAttachment[];
  uploadingFiles: never[];
  removePreviewFile: (index: number) => void;
  clearPreviewFiles: () => void;
  handleFileSelect: (files: File[]) => Promise<FileAttachment[]>;
  handleCameraCapture: (file: File) => Promise<void>;
  cancelUpload: (_fileId: string) => void;
  handleMediaCapture: (_blob: Blob, _type: 'audio' | 'video') => void;
  isRecording: boolean;
  setIsRecording: (value: boolean) => void;
  isReadyToUpload: boolean;
  isSessionReady: boolean;
  simulateUserMessage: (messageText: string, attachments?: FileAttachment[]) => Promise<string>;
  simulatePracticeMemberResponse: (messageText: string, delay?: number, avatarName?: string) => Promise<void>;
  simulateScenario: (scenarioId: string) => Promise<void>;
  resetConversation: () => void;
  clearDebugEvents: () => void;
  setSimulationSpeed: (speed: number) => void;
  setSimulateDeliveryDelay: (value: boolean) => void;
  setSimulateTyping: (value: boolean) => void;
}
