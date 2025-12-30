import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ContactData } from '@/features/intake/components/ContactForm';
import type { FileAttachment } from '../../../../worker/types';
import type { DebugEvent, MockChatState, MockMessage, UseMockChatResult } from './types';
import { scenarios } from './scenarios';
import { applyDeliveryState, randomId } from './utils';

const DEFAULT_DELAY = 600;

export function useMockChat(): UseMockChatResult {
  const [state, setState] = useState<MockChatState>({
    messages: [],
    conversationId: randomId(),
    status: 'ready',
    isTyping: false,
    errorMessage: null,
    simulationSpeed: 1,
    simulateDeliveryDelay: true,
    simulateTyping: true,
    isAnonymous: true
  });
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);
  const [previewFiles, setPreviewFiles] = useState<FileAttachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const isRunningScenario = useRef(false);
  const systemMessagesInitialized = useRef({
    welcome: false,
    contactForm: false,
    submissionConfirm: false
  });

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

  const intakeStatus = useMemo(() => {
    if (!state.isAnonymous) {
      return { step: 'completed' };
    }

    const intakeDecision = state.messages.find((message) => {
      const decision = message.metadata?.intakeDecision;
      return decision === 'accepted' || decision === 'rejected';
    })?.metadata?.intakeDecision as 'accepted' | 'rejected' | undefined;

    if (intakeDecision === 'accepted') {
      return { step: 'accepted' };
    }
    if (intakeDecision === 'rejected') {
      return { step: 'rejected' };
    }

    const userMessages = state.messages.filter((message) => message.isUser);
    const hasSubmittedContactForm = state.messages.some(
      (message) => message.isUser && message.metadata?.isContactFormSubmission
    );

    if (userMessages.length === 0) return { step: 'ready' };
    if (userMessages.length >= 1 && !hasSubmittedContactForm) return { step: 'contact_form' };
    if (hasSubmittedContactForm) return { step: 'pending_review' };
    return { step: 'completed' };
  }, [state.isAnonymous, state.messages]);

  useEffect(() => {
    if (!state.isAnonymous) {
      // Reset initialization state when switching to authenticated mode
      systemMessagesInitialized.current = {
        welcome: false,
        contactForm: false,
        submissionConfirm: false
      };
      return;
    }

    // Check current state to determine what needs to be added
    const hasWelcome = state.messages.some((message) => message.id === 'system-welcome');
    const hasContactForm = state.messages.some((message) => message.id === 'system-contact-form');
    const hasSubmissionConfirm = state.messages.some((message) => message.id === 'system-submission-confirm');
    const userMessages = state.messages.filter((message) => message.isUser);
    const hasSubmittedContactForm = state.messages.some(
      (message) => message.isUser && message.metadata?.isContactFormSubmission
    );

    // Use ref to prevent re-initialization - only add if not already initialized
    const shouldAddWelcome = !systemMessagesInitialized.current.welcome && !hasWelcome && state.messages.length === 0;
    const shouldAddContactForm = !systemMessagesInitialized.current.contactForm && !hasContactForm && userMessages.length >= 1;
    const shouldAddSubmissionConfirm = !systemMessagesInitialized.current.submissionConfirm && !hasSubmissionConfirm && hasSubmittedContactForm;

    // Early return if nothing needs to be added
    if (!shouldAddWelcome && !shouldAddContactForm && !shouldAddSubmissionConfirm) {
      return;
    }

    setState((prev) => {
      let messages = prev.messages.length > 0 ? [...prev.messages] : [];
      let changed = false;

      // Use reduce instead of Math.max with spread to avoid stack limits
      const maxTimestamp = messages.length > 0 
        ? messages.reduce((max, msg) => Math.max(max, msg.timestamp), 0)
        : Date.now();
      let nextTimestamp = maxTimestamp + 1;

      const addSystemMessage = (id: string, content: string, extras?: Partial<MockMessage>) => {
        messages = [
          ...messages,
          {
            id,
            content,
            isUser: false,
            role: 'assistant',
            timestamp: nextTimestamp++,
            ...extras
          }
        ];
        changed = true;
      };

      // Add welcome message only once when messages array is empty
      if (shouldAddWelcome) {
        addSystemMessage(
          'system-welcome',
          "Hi! I'm Blawby AI. Share a quick summary of your case and I'll guide you to the right next step."
        );
        systemMessagesInitialized.current.welcome = true;
      }

      // Add contact form only once when user has sent first message
      if (shouldAddContactForm) {
        addSystemMessage('system-contact-form', 'Could you share your contact details? It will help us find the best lawyer for your case.', {
          contactForm: {
            fields: ['name', 'email', 'phone', 'location', 'opposingParty', 'description'],
            required: ['name', 'email'],
            message: undefined
          }
        });
        systemMessagesInitialized.current.contactForm = true;
      }

      // Add submission confirm only once when contact form has been submitted
      if (shouldAddSubmissionConfirm) {
        addSystemMessage(
          'system-submission-confirm',
          "Thanks! I've sent your intake to the practice. A legal professional will review it and reply here. You'll receive in-app updates as soon as there's a decision."
        );
        systemMessagesInitialized.current.submissionConfirm = true;
      }

      if (!changed) return prev;

      messages = messages.sort((a, b) => a.timestamp - b.timestamp);
      return {
        ...prev,
        messages
      };
    });
  }, [state.isAnonymous, state.messages]);

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

  const simulateContactFormSubmit = useCallback(
    async (contactData: ContactData) => {
      const id = randomId();
      const contactMessage = `Contact Information:
Name: ${contactData.name}
Email: ${contactData.email}
Phone: ${contactData.phone}
Location: ${contactData.location}${contactData.opposingParty ? `\nOpposing Party: ${contactData.opposingParty}` : ''}${contactData.description ? `\nDescription: ${contactData.description}` : ''}`;

      const message: MockMessage = {
        id,
        content: contactMessage,
        isUser: true,
        role: 'user',
        timestamp: Date.now(),
        metadata: {
          isContactFormSubmission: true
        }
      };

      setState((prev) => {
        const hasContactForm = prev.messages.some((existing) => existing.id === 'system-contact-form');
        let messages = [...prev.messages];
        const maxTimestamp = messages.length > 0
          ? messages.reduce((max, m) => Math.max(max, m.timestamp), -Infinity)
          : Date.now();
        let nextTimestamp = Math.max(Date.now(), maxTimestamp + 1);

        if (prev.isAnonymous && !hasContactForm) {
          messages = [
            ...messages,
            {
              id: 'system-contact-form',
              content: 'Could you share your contact details? It will help us find the best lawyer for your case.',
              isUser: false,
              role: 'assistant',
              timestamp: nextTimestamp++,
              contactForm: {
                fields: ['name', 'email', 'phone', 'location', 'opposingParty', 'description'],
                required: ['name', 'email'],
                message: undefined
              }
            }
          ];
        }

        messages = [
          ...messages,
          {
            ...message,
            timestamp: nextTimestamp++
          }
        ];

        return {
          ...prev,
          messages,
          status: 'submitting'
        };
      });
      addDebugEvent('contact_form:submitted', {
        id,
        fields: {
          name: !!contactData.name,
          email: !!contactData.email,
          phone: !!contactData.phone,
          location: !!contactData.location,
          opposingParty: !!contactData.opposingParty,
          description: !!contactData.description
        }
      });

      if (state.simulateDeliveryDelay) {
        await delay(DEFAULT_DELAY / 1.5);
      }

      setStatus('ready');
    },
    [addDebugEvent, delay, setStatus, state.simulateDeliveryDelay]
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
      setState((prev) => ({
        ...prev,
        messages: [],
        status: 'ready',
        isTyping: false,
        isAnonymous: scenario.mode !== 'authenticated'
      }));

      const ensurePrefilledContactForm = async (contactData: ContactData) => {
        setState((prev) => {
          if (!prev.isAnonymous) return prev;

          const contactFormPayload = {
            fields: ['name', 'email', 'phone', 'location', 'opposingParty', 'description'],
            required: ['name', 'email'],
            message: undefined,
            initialValues: {
              name: contactData.name,
              email: contactData.email,
              phone: contactData.phone,
              location: contactData.location,
              opposingParty: contactData.opposingParty
            }
          };

          let changed = false;
          let messages = prev.messages.map((message) => {
            if (message.id !== 'system-contact-form') return message;
            changed = true;
            return {
              ...message,
              contactForm: contactFormPayload
            };
          });

          if (!changed) {
            const maxTimestamp = messages.length > 0
              ? messages.reduce((max, message) => Math.max(max, message.timestamp), -Infinity)
              : Date.now();
            const nextTimestamp = messages.length > 0 ? maxTimestamp + 1 : Date.now();
            messages = [
              ...messages,
              {
                id: 'system-contact-form',
                content: 'Could you share your contact details? It will help us find the best lawyer for your case.',
                isUser: false,
                role: 'assistant',
                timestamp: nextTimestamp,
                contactForm: contactFormPayload
              }
            ];
            changed = true;
          }

          return changed ? { ...prev, messages } : prev;
        });
      };

      for (const step of scenario.steps) {
        if (step.type === 'user') {
          if (!step.content) continue;
          await simulateUserMessage(step.content, step.attachments ?? []);
        } else if (step.type === 'contact_form_submit') {
          if (!step.contactData) continue;
          await ensurePrefilledContactForm(step.contactData);
          await delay(DEFAULT_DELAY / 1.5);
          await simulateContactFormSubmit(step.contactData);
        } else {
          if (!step.content) continue;
          await simulatePracticeMemberResponse(step.content, step.delay ?? DEFAULT_DELAY);
        }
      }

      addDebugEvent('scenario:complete', { scenarioId });
      isRunningScenario.current = false;
    },
    [addDebugEvent, delay, simulateContactFormSubmit, simulatePracticeMemberResponse, simulateUserMessage]
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

  const setIsAnonymous = useCallback((value: boolean) => {
    setState((prev) => ({ ...prev, isAnonymous: value }));
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
    intakeStatus,
    simulateUserMessage,
    simulatePracticeMemberResponse,
    simulateContactFormSubmit,
    simulateScenario,
    resetConversation,
    clearDebugEvents,
    setIsAnonymous,
    setSimulationSpeed,
    setSimulateDeliveryDelay,
    setSimulateTyping
  };
}
