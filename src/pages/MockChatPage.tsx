import { useEffect, useMemo, useState } from 'preact/hooks';
import ChatContainer from '@/features/chat/components/ChatContainer';
import { MockChatControls } from '@/features/chat/mock/components/MockChatControls';
import { DebugPanel } from '@/features/chat/mock/components/DebugPanel';
import { MockChatInfo } from '@/features/chat/mock/components/MockChatInfo';
import { useMockChat } from '@/features/chat/mock/useMockChat';
import type { ChatMessageUI } from '../../worker/types';

export function MockChatPage() {
  const [isDevMode, setIsDevMode] = useState(import.meta.env.DEV || import.meta.env.MODE === 'development');
  const mock = useMockChat();
  const [hasAutoStarted, setHasAutoStarted] = useState(false);

  useEffect(() => {
    const dev = import.meta.env.MODE === 'development' || import.meta.env.DEV;
    setIsDevMode(dev);
    if (!dev) {
      window.location.href = '/';
    }
  }, []);

  useEffect(() => {
    if (!isDevMode || hasAutoStarted) return;
    setHasAutoStarted(true);
    void mock.simulateScenario('guest-intake');
  }, [hasAutoStarted, isDevMode, mock]);

  const practiceConfig = useMemo(() => ({
    name: 'Mock Practice',
    profileImage: null,
    practiceId: 'mock-practice-id',
    description: 'Development-only mock practice'
  }), []);

  if (!isDevMode) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-500 dark:text-gray-300">
        Redirecting…
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white dark:bg-dark-bg">
      <MockChatControls mock={mock} />

      <div className="flex-1 flex flex-col">
        <div className="flex-1 min-h-0 flex flex-col">
          <ChatContainer
            messages={mock.state.messages as ChatMessageUI[]}
            onSendMessage={async (message, attachments) => {
              await mock.simulateUserMessage(message, attachments);
              if (!mock.state.isAnonymous) {
                await mock.simulatePracticeMemberResponse('Thanks for sharing! We are reviewing your message.', 900);
              }
              mock.clearPreviewFiles();
            }}
            onContactFormSubmit={mock.simulateContactFormSubmit}
            practiceConfig={practiceConfig}
            onOpenSidebar={() => undefined}
            practiceId={practiceConfig.practiceId}
            previewFiles={mock.previewFiles}
            uploadingFiles={mock.uploadingFiles}
            removePreviewFile={mock.removePreviewFile}
            clearPreviewFiles={mock.clearPreviewFiles}
            handleFileSelect={async (files) => {
              await mock.handleFileSelect(files);
            }}
            handleCameraCapture={mock.handleCameraCapture}
            cancelUpload={mock.cancelUpload}
            handleMediaCapture={mock.handleMediaCapture}
            isRecording={mock.isRecording}
            setIsRecording={mock.setIsRecording}
            isReadyToUpload={mock.isReadyToUpload}
            isSessionReady={mock.isSessionReady}
            intakeStatus={mock.intakeStatus}
            isAnonymousUser={mock.state.isAnonymous}
          />
        </div>

        <DebugPanel events={mock.debugEvents} onClear={mock.clearDebugEvents} />
      </div>

      <MockChatInfo mock={mock} />
    </div>
  );
}
