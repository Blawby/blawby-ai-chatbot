import { useCallback, useRef, useState } from 'preact/hooks';
import type { FileAttachment } from '../../../../worker/types';
import type { DebugEvent, MockChatState, MockMessage, UseMockChatResult } from './types';
import { scenarios } from './scenarios';
import { applyDeliveryState, randomId } from './utils';

const DEFAULT_DELAY = 600;

export function useMockChat(): UseMockChatResult {
  const [state, setState] = useState<MockChatState>({
    messages: [
      {
        id: randomId(),
        content: 'Welcome to the mock chat! Use the controls on the left to run scenarios.',
        isUser: false,
        role: 'assistant',
        timestamp: Date.now()
      }
    ],
    conversationId: randomId(),
    status: 'ready',
    isTyping: false,
    errorMessage: null,
    simulationSpeed: 1,
    simulateDeliveryDelay: true,
    simulateTyping: true
  });
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);
  const [previewFiles, setPreviewFiles] = useState<FileAttachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const isRunningScenario = useRef(false);

  const addDebugEvent = useCallback((type: string, data: Record<string, unknown> = {}) => {
    setDebugEvents((events) => [
      {
        id: randomId(),
        type,
        data,
        timestamp: new Date().toISOString()
      },
      ...events
    ]);
  }, []);

  const setStatus = useCallback((status: MockChatState['status']) => {
    setState((prev) => ({ ...prev, status }));
  }, []);

  const delay = useCallback(
    (ms: number) =>
      new Promise((resolve) => {
        const effectiveDelay = state.simulationSpeed > 0 ? ms / state.simulationSpeed : ms;
        setTimeout(resolve, effectiveDelay);
      }),
    [state.simulationSpeed]
  );

  const updateMessageMetadata = useCallback((messageId: string, updates: Partial<MockMessage['metadata']>) => {
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              metadata: { ...(message.metadata ?? {}), ...updates }
            }
          : message
      )
    }));
  }, []);

  const simulateUserMessage = useCallback(
    async (messageText: string, attachments: FileAttachment[] = []) => {
      const id = randomId();
      const timestamp = Date.now();
      const message: MockMessage = {
        id,
        content: messageText,
        isUser: true,
        role: 'user',
        timestamp,
        files: attachments,
        metadata: applyDeliveryState(undefined, 'sending')
      };

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, message],
        status: 'submitting'
      }));
      addDebugEvent('message:sent', { id, content: messageText, attachments: attachments.length });

      if (state.simulateDeliveryDelay) {
        await delay(DEFAULT_DELAY);
        updateMessageMetadata(id, applyDeliveryState(undefined, 'sent'));
        addDebugEvent('message:delivered', { id });

        await delay(DEFAULT_DELAY / 1.5);
        updateMessageMetadata(id, applyDeliveryState(undefined, 'delivered'));
        addDebugEvent('message:delivered:confirm', { id });
      } else {
        updateMessageMetadata(id, applyDeliveryState(undefined, 'delivered'));
      }

      setStatus('ready');
      return id;
    },
    [addDebugEvent, delay, setStatus, state.simulateDeliveryDelay, updateMessageMetadata]
  );

  const simulatePracticeMemberResponse = useCallback(
    async (messageText: string, delayMs = 1200, avatarName?: string) => {
      if (state.simulateTyping) {
        setState((prev) => ({ ...prev, isTyping: true, status: 'streaming' }));
        addDebugEvent('typing:start', {});
      }

      await delay(delayMs);

      if (state.simulateTyping) {
        setState((prev) => ({ ...prev, isTyping: false }));
        addDebugEvent('typing:stop', {});
      }

      const id = randomId();
      const assistantMessage: MockMessage = {
        id,
        content: messageText,
        isUser: false,
        role: 'assistant',
        timestamp: Date.now(),
        metadata: {
          avatar: avatarName ? { name: avatarName, src: null } : undefined
        }
      };

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
        status: 'ready'
      }));
      addDebugEvent('message:received', { id, content: messageText });
    },
    [addDebugEvent, delay, state.simulateTyping]
  );

  const simulateScenario = useCallback(
    async (scenarioId: string) => {
      if (isRunningScenario.current) return;

      const scenario = scenarios.find((s) => s.id === scenarioId);
      if (!scenario) return;

      isRunningScenario.current = true;
      addDebugEvent('scenario:start', { scenarioId });
      setState((prev) => ({ ...prev, messages: [], status: 'ready', isTyping: false }));

      for (const step of scenario.steps) {
        if (step.type === 'user') {
          const messageId = await simulateUserMessage(step.content, step.attachments ?? []);
          if (scenario.id === 'error-state') {
            updateMessageMetadata(messageId, applyDeliveryState(undefined, 'error'));
            addDebugEvent('message:error', { id: messageId });
          }
        } else {
          const avatarName =
            scenario.id === 'multiple-participants'
              ? step.content.includes('Taylor')
                ? 'Taylor'
                : step.content.includes('Alex')
                  ? 'Alex'
                  : 'Practice Member'
              : undefined;
          await simulatePracticeMemberResponse(step.content, step.delay ?? DEFAULT_DELAY, avatarName);
        }
      }

      addDebugEvent('scenario:complete', { scenarioId });
      isRunningScenario.current = false;
    },
    [addDebugEvent, simulatePracticeMemberResponse, simulateUserMessage, updateMessageMetadata]
  );

  const resetConversation = useCallback(() => {
    setState((prev) => ({
      ...prev,
      messages: [],
      conversationId: randomId(),
      status: 'ready',
      isTyping: false,
      errorMessage: null
    }));
    setPreviewFiles([]);
    addDebugEvent('conversation:reset', {});
  }, [addDebugEvent]);

  const clearDebugEvents = useCallback(() => {
    setDebugEvents([]);
  }, []);

  const handleFileSelect = useCallback(
    async (files: File[]) => {
      const attachments: FileAttachment[] = files.map((file) => ({
        id: randomId(),
        name: file.name,
        size: file.size,
        type: file.type,
        url: URL.createObjectURL(file)
      }));
      setPreviewFiles((prev) => [...prev, ...attachments]);
      return attachments;
    },
    []
  );

  const handleCameraCapture = useCallback(async (file: File) => {
    await handleFileSelect([file]);
  }, [handleFileSelect]);

  const handleMediaCapture = useCallback(async (_blob: Blob, _type: 'audio' | 'video') => {
    // Media capture is mocked; file upload is no-op for dev preview.
    return;
  }, []);

  const removePreviewFile = useCallback((index: number) => {
    setPreviewFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearPreviewFiles = useCallback(() => {
    setPreviewFiles([]);
  }, []);

  const setSimulationSpeed = useCallback((speed: number) => {
    setState((prev) => ({ ...prev, simulationSpeed: Math.max(0.1, Math.min(speed, 2)) }));
  }, []);

  const setSimulateDeliveryDelay = useCallback((value: boolean) => {
    setState((prev) => ({ ...prev, simulateDeliveryDelay: value }));
  }, []);

  const setSimulateTyping = useCallback((value: boolean) => {
    setState((prev) => ({ ...prev, simulateTyping: value }));
  }, []);

  const isSessionReady = true;
  const isReadyToUpload = true;
  return {
    state,
    debugEvents,
    previewFiles,
    uploadingFiles: [],
    removePreviewFile,
    clearPreviewFiles,
    handleFileSelect,
    handleCameraCapture,
    cancelUpload: () => undefined,
    handleMediaCapture,
    isRecording,
    setIsRecording,
    isReadyToUpload,
    isSessionReady,
    simulateUserMessage,
    simulatePracticeMemberResponse,
    simulateScenario,
    resetConversation,
    clearDebugEvents,
    setSimulationSpeed,
    setSimulateDeliveryDelay,
    setSimulateTyping
  };
}
