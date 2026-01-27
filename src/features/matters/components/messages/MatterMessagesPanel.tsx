import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ulid } from 'ulid';
import ChatContainer from '@/features/chat/components/ChatContainer';
import type { MatterDetail } from '@/features/matters/data/mockMatters';
import type { ChatMessageUI, FileAttachment } from '../../../../../worker/types';
import type { UploadingFile } from '@/shared/hooks/useFileUpload';
import { Avatar } from '@/shared/ui/profile';

const buildMockMessages = (matter: MatterDetail): ChatMessageUI[] => {
  const now = Date.now();
  return [
    {
      id: `${matter.id}-m1`,
      role: 'user',
      content: 'Can we confirm the deadline for the filing?',
      timestamp: now - 1000 * 60 * 60 * 24,
      isUser: true,
      metadata: {
        displayName: matter.clientName,
        role: 'Client'
      }
    },
    {
      id: `${matter.id}-m2`,
      role: 'assistant',
      content: 'Draft is ready for review. I can send it over once approved.',
      timestamp: now - 1000 * 60 * 60 * 18,
      isUser: false,
      metadata: {
        displayName: 'Jordan Lee',
        role: 'Paralegal'
      }
    },
    {
      id: `${matter.id}-m3`,
      role: 'assistant',
      content: 'Thanks! I will review and respond by end of day.',
      timestamp: now - 1000 * 60 * 60 * 2,
      isUser: false,
      metadata: {
        displayName: 'You',
        role: 'Lead Attorney'
      }
    }
  ];
};

interface MatterMessagesPanelProps {
  matter: MatterDetail;
}

export const MatterMessagesPanel = ({ matter }: MatterMessagesPanelProps) => {
  const [messages, setMessages] = useState<ChatMessageUI[]>(() => buildMockMessages(matter));
  const [previewFiles, setPreviewFiles] = useState<FileAttachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const previewUrlsRef = useRef<string[]>([]);

  const participants = useMemo(() => {
    const names = new Map<string, { name: string; role?: string }>();
    messages.forEach((message) => {
      const displayName = typeof message.metadata?.displayName === 'string'
        ? message.metadata.displayName
        : message.isUser ? 'You' : 'Blawby';
      if (!displayName.trim()) return;
      names.set(displayName, {
        name: displayName,
        role: typeof message.metadata?.role === 'string' ? message.metadata.role : undefined
      });
    });
    return Array.from(names.values());
  }, [messages]);

  const sortedMessages = useMemo(() => (
    [...messages].sort((a, b) => a.timestamp - b.timestamp)
  ), [messages]);

  const handleSendMessage = (content: string, attachments: FileAttachment[]) => {
    const nextMessage: ChatMessageUI = {
      id: ulid(),
      role: 'user',
      content,
      timestamp: Date.now(),
      isUser: true,
      metadata: {
        displayName: 'You',
        role: 'Lead Attorney',
        attachments
      }
    };

    setMessages((prev) => [nextMessage, ...prev]);
  };

  const handleFileSelect = async (files: File[]) => {
    const next = files.map((file) => ({
      id: ulid(),
      name: file.name,
      size: file.size,
      type: file.type,
      url: URL.createObjectURL(file)
    }));
    setPreviewFiles((prev) => [...prev, ...next]);
  };

  const handleCameraCapture = async (file: File) => {
    await handleFileSelect([file]);
  };

  const handleMediaCapture = (_blob: Blob, _type: 'audio' | 'video') => {};

  const removePreviewFile = (index: number) => {
    setPreviewFiles((prev) => {
      const target = prev[index];
      if (target?.url) {
        URL.revokeObjectURL(target.url);
      }
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const clearPreviewFiles = () => {
    setPreviewFiles((prev) => {
      prev.forEach((file) => {
        if (file.url) {
          URL.revokeObjectURL(file.url);
        }
      });
      return [];
    });
  };

  const cancelUpload = (fileId: string) => {
    setUploadingFiles((prev) => prev.filter((file) => file.id !== fileId));
  };

  useEffect(() => {
    previewUrlsRef.current = previewFiles.map((file) => file.url).filter(Boolean);
  }, [previewFiles]);

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 dark:border-white/10 px-6 py-4">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Matter conversation</p>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{matter.title}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {participants.slice(0, 4).map((participant) => (
            <Avatar
              key={participant.name}
              name={participant.name}
              size="xs"
              className="bg-gray-200 text-gray-700 dark:bg-gray-700"
            />
          ))}
          {participants.length > 4 && (
            <span className="ml-1 text-xs font-medium text-gray-500 dark:text-gray-400">
              +{participants.length - 4}
            </span>
          )}
        </div>
      </header>
      <div className="h-[540px] flex flex-col">
        <ChatContainer
          messages={sortedMessages}
          conversationTitle={`Matter ${matter.title}`}
          onSendMessage={handleSendMessage}
          previewFiles={previewFiles}
          uploadingFiles={uploadingFiles}
          removePreviewFile={removePreviewFile}
          clearPreviewFiles={clearPreviewFiles}
          handleFileSelect={handleFileSelect}
          handleCameraCapture={handleCameraCapture}
          cancelUpload={cancelUpload}
          handleMediaCapture={handleMediaCapture}
          isRecording={isRecording}
          setIsRecording={setIsRecording}
          isReadyToUpload
          isSessionReady
          isSocketReady
          practiceConfig={{
            name: 'Blawby',
            profileImage: null,
            practiceId: 'preview',
            description: 'Matter conversation',
            slug: 'blawby',
            introMessage: null
          }}
          practiceId="preview"
          conversationId={matter.id}
          showPracticeHeader={false}
          heightClassName="h-full"
          messagesReady
        />
      </div>
    </section>
  );
};
