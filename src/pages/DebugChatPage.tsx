import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import ChatContainer from '@/features/chat/components/ChatContainer';
import { STREAMING_BUBBLE_PREFIX } from '@/shared/hooks/useConversation';
import type { ChatMessageUI, FileAttachment } from '../../worker/types';
import type { UploadingFile } from '@/shared/hooks/useFileUpload';

const STREAM_TEXT = 'Absolutely. I can help with that. First, share your filing deadline and key facts, then I can draft a focused response outline.';

const randomId = () => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

const createUserMessage = (content: string, files: FileAttachment[] = []): ChatMessageUI => ({
  id: `user-${randomId()}`,
  role: 'user',
  content,
  timestamp: Date.now(),
  reply_to_message_id: null,
  metadata: files.length > 0 ? { attachments: files.map((file) => file.id ?? file.storageKey ?? file.url) } : undefined,
  userId: 'debug-user',
  files,
  isUser: true,
});

const createStreamingBubble = (runId: string, showThinking: boolean): ChatMessageUI => ({
  id: `${STREAMING_BUBBLE_PREFIX}${runId}`,
  role: 'assistant',
  content: '',
  timestamp: Date.now(),
  reply_to_message_id: null,
  metadata: { source: 'ai' },
  isUser: false,
  isLoading: showThinking,
});

const createAssistantMessage = (runId: string, content: string): ChatMessageUI => ({
  id: `assistant-${runId}`,
  role: 'assistant',
  content,
  timestamp: Date.now(),
  reply_to_message_id: null,
  metadata: { source: 'ai' },
  userId: null,
  isUser: false,
});

export default function DebugChatPage() {
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [previewFiles, setPreviewFiles] = useState<FileAttachment[]>([]);
  const [uploadingFiles] = useState<UploadingFile[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  const delayTimerRef = useRef<number | null>(null);
  const streamTimerRef = useRef<number | null>(null);
  const activeRunRef = useRef<string | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  const practiceConfig = useMemo(
    () => ({
      name: 'Blawby AI',
      profileImage: null,
      practiceId: 'debug-practice',
      introMessage: 'This is the real chat container with mocked streaming behavior for style tuning.',
    }),
    []
  );

  const clearTimers = () => {
    if (delayTimerRef.current) {
      window.clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
    if (streamTimerRef.current) {
      window.clearTimeout(streamTimerRef.current);
      streamTimerRef.current = null;
    }
  };

  const revokeAndClearObjectUrls = () => {
    objectUrlsRef.current.forEach((url) => {
      URL.revokeObjectURL(url);
    });
    objectUrlsRef.current.clear();
  };

  const resetState = () => {
    clearTimers();
    activeRunRef.current = null;
    revokeAndClearObjectUrls();
    setPreviewFiles([]);
    setMessages([]);
  };

  useEffect(() => {
    return () => {
      clearTimers();
      revokeAndClearObjectUrls();
    };
  }, []);

  const removePreviewFile = (index: number) => {
    setPreviewFiles((prev) => {
      const target = prev[index];
      if (target?.url?.startsWith('blob:')) {
        URL.revokeObjectURL(target.url);
        objectUrlsRef.current.delete(target.url);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const clearPreviewFiles = () => {
    revokeAndClearObjectUrls();
    setPreviewFiles([]);
  };

  const handleFileSelect = async (files: File[]) => {
    const nextAttachments = files.map((file): FileAttachment => {
      const url = URL.createObjectURL(file);
      objectUrlsRef.current.add(url);
      return {
        id: `local-${randomId()}`,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        url,
      };
    });
    setPreviewFiles((prev) => [...prev, ...nextAttachments]);
  };

  const handleCameraCapture = async (file: File) => {
    await handleFileSelect([file]);
  };

  const handleMediaCapture = (blob: Blob, type: 'audio' | 'video') => {
    const extension = type === 'audio' ? 'webm' : 'mp4';
    const file = new File([blob], `${type}-${Date.now()}.${extension}`, {
      type: blob.type || (type === 'audio' ? 'audio/webm' : 'video/mp4'),
    });
    void handleFileSelect([file]);
  };

  const simulateAssistantResponse = (runId: string) => {
    const bubbleId = `${STREAMING_BUBBLE_PREFIX}${runId}`;
    let index = 0;

    const startStreaming = () => {
      if (activeRunRef.current !== runId) return;
      setMessages((prev) => prev.map((msg) => (
        msg.id === bubbleId ? { ...msg, isLoading: false } : msg
      )));

      const step = () => {
        if (activeRunRef.current !== runId) return;
        if (index >= STREAM_TEXT.length) {
          setMessages((prev) => {
            const bubble = prev.find((msg) => msg.id === bubbleId);
            const finalContent = bubble?.content ?? STREAM_TEXT;
            const withoutBubble = prev.filter((msg) => msg.id !== bubbleId);
            return [...withoutBubble, createAssistantMessage(runId, finalContent)];
          });
          return;
        }
        const nextIndex = Math.min(index + 3, STREAM_TEXT.length);
        const token = STREAM_TEXT.slice(index, nextIndex);
        setMessages((prev) => prev.map((msg) => (
          msg.id === bubbleId ? { ...msg, content: msg.content + token } : msg
        )));
        index = nextIndex;
        streamTimerRef.current = window.setTimeout(step, 35);
      };

      step();
    };

    delayTimerRef.current = window.setTimeout(startStreaming, 900);
  };

  const handleSendMessage = (message: string, attachments: FileAttachment[]) => {
    clearTimers();
    const runId = `debug-run-${randomId()}`;
    activeRunRef.current = runId;
    setMessages((prev) => [
      ...prev,
      createUserMessage(message, attachments),
      createStreamingBubble(runId, true),
    ]);
    simulateAssistantResponse(runId);
  };

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-input-text">Debug Chat Experience</h1>
        <p className="text-sm text-input-placeholder">
          Real chat container + composer with mocked LLM streaming and persisted message replacement.
        </p>
      </header>

      <section className="glass-panel space-y-3 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={resetState}>
            Reset chat
          </Button>
        </div>

        <div className="h-[640px] overflow-hidden rounded-xl border border-input-border/60 bg-transparent">
          <ChatContainer
            messages={messages}
            conversationTitle="Debug Chat"
            onSendMessage={handleSendMessage}
            conversationMode="ASK_QUESTION"
            isPublicWorkspace
            practiceConfig={practiceConfig}
            layoutMode="widget"
            previewFiles={previewFiles}
            uploadingFiles={uploadingFiles}
            removePreviewFile={removePreviewFile}
            clearPreviewFiles={clearPreviewFiles}
            handleFileSelect={handleFileSelect}
            handleCameraCapture={handleCameraCapture}
            cancelUpload={() => undefined}
            handleMediaCapture={handleMediaCapture}
            isRecording={isRecording}
            setIsRecording={setIsRecording}
            isReadyToUpload
            isSessionReady
            isSocketReady
            messagesReady
          />
        </div>
      </section>
    </main>
  );
}
