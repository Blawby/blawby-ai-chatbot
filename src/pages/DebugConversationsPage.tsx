import { useMemo, useState } from 'preact/hooks';
import { ChatBubbleLeftRightIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { Button } from '@/shared/ui/Button';
import WorkspacePage from '@/features/chat/pages/WorkspacePage';
import WorkspaceConversationHeader from '@/features/chat/components/WorkspaceConversationHeader';
import PracticeConversationHeaderMenu from '@/features/chat/components/PracticeConversationHeaderMenu';
import ChatContainer from '@/features/chat/components/ChatContainer';
import Modal from '@/shared/components/Modal';
import type { Conversation } from '@/shared/types/conversation';
import type { UploadingFile } from '@/shared/hooks/useFileUpload';
import type { FileAttachment, ChatMessageUI } from '../../worker/types';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';

type WorkspaceKind = 'practice' | 'client';
type ClientView = 'list' | 'conversation';

interface SeedMessage {
  id: string;
  content: string;
  senderName: string;
  isMine: boolean;
  minutesAgo: number;
}

interface SeedConversation {
  id: string;
  title: string;
  status: 'active';
  assignedTo?: string | null;
  unreadCount?: number;
  lastMessageMinutesAgo: number;
  lead: boolean;
  preview: string;
  messages: SeedMessage[];
}

const PRACTICE_ID = 'debug-practice';
const PRACTICE_SLUG = 'debug-practice';
const PRACTICE_NAME = 'Blawby Family Law';
const PRACTICE_LOGO = null;

const practiceSeeds: SeedConversation[] = [
  {
    id: 'practice-conv-1',
    title: 'Indigo Squirrel from Greenwich',
    status: 'active',
    assignedTo: null,
    unreadCount: 6,
    lastMessageMinutesAgo: 3,
    lead: true,
    preview: 'Where can I upload my timeline and school records?',
    messages: [
      { id: 'p1-1', content: 'Just signed up and love this flow. Where can I upload my timeline and school records?', senderName: 'Indigo Squirrel', isMine: false, minutesAgo: 7 },
      { id: 'p1-2', content: 'Attach them directly in this thread and I can map each doc to the right matter section.', senderName: 'Paul Yahoo', isMine: true, minutesAgo: 5 },
      { id: 'p1-3', content: 'Perfect, I am uploading now.', senderName: 'Indigo Squirrel', isMine: false, minutesAgo: 3 },
    ],
  },
  {
    id: 'practice-conv-2',
    title: 'Teal Guitar from Mora',
    status: 'active',
    assignedTo: 'user-1',
    unreadCount: 0,
    lastMessageMinutesAgo: 12,
    lead: false,
    preview: 'Can we do Thursday 10am for the consult?',
    messages: [
      { id: 'p2-1', content: 'Can we do Thursday 10am for the consult?', senderName: 'Teal Guitar', isMine: false, minutesAgo: 14 },
      { id: 'p2-2', content: 'Yes, that slot is available. I will send a checklist right after this.', senderName: 'Paul Yahoo', isMine: true, minutesAgo: 12 },
    ],
  },
  {
    id: 'practice-conv-3',
    title: 'Pink Joystick from Kuwait',
    status: 'active',
    assignedTo: 'user-2',
    unreadCount: 3,
    lastMessageMinutesAgo: 17,
    lead: true,
    preview: 'Do you offer payment plans for family matters?',
    messages: [
      { id: 'p3-1', content: 'Do you offer payment plans for family matters?', senderName: 'Pink Joystick', isMine: false, minutesAgo: 20 },
      { id: 'p3-2', content: 'Yes, we can split retainer payments based on scope.', senderName: 'Paul Yahoo', isMine: true, minutesAgo: 17 },
    ],
  },
  {
    id: 'practice-conv-4',
    title: 'Cyan Lantern from Austin',
    status: 'active',
    assignedTo: null,
    unreadCount: 2,
    lastMessageMinutesAgo: 28,
    lead: false,
    preview: 'Can I upload video evidence from my phone?',
    messages: [
      { id: 'p4-1', content: 'Can I upload video evidence from my phone?', senderName: 'Cyan Lantern', isMine: false, minutesAgo: 30 },
      { id: 'p4-2', content: 'Yes, you can upload video directly in this thread.', senderName: 'Paul Yahoo', isMine: true, minutesAgo: 28 },
    ],
  },
  {
    id: 'practice-conv-5',
    title: 'Orange Orbit from Dallas',
    status: 'active',
    assignedTo: 'user-3',
    unreadCount: 0,
    lastMessageMinutesAgo: 42,
    lead: false,
    preview: 'I confirmed the consultation time.',
    messages: [
      { id: 'p5-1', content: 'I confirmed the consultation time.', senderName: 'Orange Orbit', isMine: false, minutesAgo: 42 },
    ],
  },
  {
    id: 'practice-conv-6',
    title: 'Silver Atlas from Boise',
    status: 'active',
    assignedTo: null,
    unreadCount: 4,
    lastMessageMinutesAgo: 55,
    lead: true,
    preview: 'Do you handle emergency custody filings?',
    messages: [
      { id: 'p6-1', content: 'Do you handle emergency custody filings?', senderName: 'Silver Atlas', isMine: false, minutesAgo: 58 },
      { id: 'p6-2', content: 'Yes, please send timeline details and current orders.', senderName: 'Paul Yahoo', isMine: true, minutesAgo: 55 },
    ],
  },
  {
    id: 'practice-conv-7',
    title: 'Violet Harbor from Miami',
    status: 'active',
    assignedTo: 'user-1',
    unreadCount: 1,
    lastMessageMinutesAgo: 71,
    lead: false,
    preview: 'What is the next filing deadline?',
    messages: [
      { id: 'p7-1', content: 'What is the next filing deadline?', senderName: 'Violet Harbor', isMine: false, minutesAgo: 71 },
    ],
  },
  {
    id: 'practice-conv-8',
    title: 'Gold River from Newark',
    status: 'active',
    assignedTo: null,
    unreadCount: 0,
    lastMessageMinutesAgo: 95,
    lead: false,
    preview: 'I uploaded all requested documents.',
    messages: [
      { id: 'p8-1', content: 'I uploaded all requested documents.', senderName: 'Gold River', isMine: false, minutesAgo: 95 },
    ],
  },
  {
    id: 'practice-conv-9',
    title: 'Bronze Compass from Portland',
    status: 'active',
    assignedTo: 'user-2',
    unreadCount: 5,
    lastMessageMinutesAgo: 110,
    lead: true,
    preview: 'Can you review the mediation agreement?',
    messages: [
      { id: 'p9-1', content: 'Can you review the mediation agreement? My ex-partner just sent it over.', senderName: 'Bronze Compass', isMine: false, minutesAgo: 115 },
      { id: 'p9-2', content: 'Please upload it here. I can take a look and provide initial feedback within 24 hours.', senderName: 'Paul Yahoo', isMine: true, minutesAgo: 110 },
    ],
  },
  {
    id: 'practice-conv-10',
    title: 'Emerald Flute from Seattle',
    status: 'active',
    assignedTo: null,
    unreadCount: 0,
    lastMessageMinutesAgo: 145,
    lead: false,
    preview: 'Thanks for the quick response on the retainer.',
    messages: [
      { id: 'p10-1', content: 'Thanks for the quick response on the retainer. I will wire the funds this afternoon.', senderName: 'Emerald Flute', isMine: false, minutesAgo: 145 },
    ],
  },
];

const clientSeeds: SeedConversation[] = [
  {
    id: 'client-conv-1',
    title: 'Case timeline and next steps',
    status: 'active',
    unreadCount: 1,
    lastMessageMinutesAgo: 2,
    lead: false,
    preview: 'I uploaded your intake summary and next-step checklist.',
    messages: [
      { id: 'c1-1', content: 'I uploaded your intake summary and next-step checklist.', senderName: 'Sarah Spangenberg', isMine: false, minutesAgo: 5 },
      { id: 'c1-2', content: 'Thanks, I also uploaded school and medical records.', senderName: 'You', isMine: true, minutesAgo: 2 },
    ],
  },
  {
    id: 'client-conv-2',
    title: 'Consultation follow-up',
    status: 'active',
    unreadCount: 0,
    lastMessageMinutesAgo: 56,
    lead: false,
    preview: 'Please confirm your preferred hearing dates.',
    messages: [
      { id: 'c2-1', content: 'Please confirm your preferred hearing dates so we can file this week.', senderName: 'Martin Duhamel', isMine: false, minutesAgo: 56 },
    ],
  },
  {
    id: 'client-conv-3',
    title: 'Documents checklist',
    status: 'active',
    unreadCount: 2,
    lastMessageMinutesAgo: 83,
    lead: false,
    preview: 'Please upload your tax return and pay stubs.',
    messages: [
      { id: 'c3-1', content: 'Please upload your tax return and pay stubs.', senderName: 'Sarah Spangenberg', isMine: false, minutesAgo: 83 },
    ],
  },
  {
    id: 'client-conv-4',
    title: 'Hearing prep',
    status: 'active',
    unreadCount: 0,
    lastMessageMinutesAgo: 121,
    lead: false,
    preview: 'We are preparing your witness questions.',
    messages: [
      { id: 'c4-1', content: 'We are preparing your witness questions.', senderName: 'Martin Duhamel', isMine: false, minutesAgo: 121 },
    ],
  },
  {
    id: 'client-conv-5',
    title: 'Legal Research & Strategy',
    status: 'active',
    unreadCount: 3,
    lastMessageMinutesAgo: 180,
    lead: false,
    preview: 'I found several precedents that support our case.',
    messages: [
      { id: 'c5-1', content: 'I found several precedents that support our case regarding the property division.', senderName: 'Martin Duhamel', isMine: false, minutesAgo: 185 },
      { id: 'c5-2', content: 'That is great news. Does this mean we have a stronger leverage for settlement?', senderName: 'You', isMine: true, minutesAgo: 180 },
    ],
  },
];

const toIso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
const toUnix = (minutesAgo: number) => Date.now() - minutesAgo * 60_000;

const mapSeedToConversation = (seed: SeedConversation): Conversation => ({
  id: seed.id,
  practice_id: PRACTICE_ID,
  practice: { id: PRACTICE_ID, name: PRACTICE_NAME, slug: PRACTICE_SLUG },
  user_id: null,
  matter_id: null,
  participants: [],
  user_info: { title: seed.title, source: 'debug' },
  status: seed.status,
  assigned_to: seed.assignedTo ?? null,
  last_message_at: toIso(seed.lastMessageMinutesAgo),
  unread_count: seed.unreadCount ?? 0,
  created_at: toIso(seed.lastMessageMinutesAgo + 120),
  updated_at: toIso(seed.lastMessageMinutesAgo),
  lead: seed.lead ? { is_lead: true, lead_source: 'debug' } : { is_lead: false },
});

const mapSeedMessageToChat = (message: SeedMessage): ChatMessageUI => ({
  id: message.id,
  role: 'user',
  content: message.content,
  timestamp: toUnix(message.minutesAgo),
  reply_to_message_id: null,
  metadata: { senderName: message.senderName },
  isUser: message.isMine,
});

const buildPreviews = (seeds: SeedConversation[]) => Object.fromEntries(
  seeds.map((seed) => [
    seed.id,
    {
      content: seed.preview,
      role: 'user',
      createdAt: toIso(seed.lastMessageMinutesAgo),
    }
  ])
);

export default function DebugConversationsPage() {
  const isMobile = useMobileDetection();
  const layoutMode = isMobile ? 'mobile' : 'desktop';
  const [workspaceKind, setWorkspaceKind] = useState<WorkspaceKind>('practice');
  const [clientView, setClientView] = useState<ClientView>('list');
  const [practiceConversationId, setPracticeConversationId] = useState(practiceSeeds[0].id);
  const [clientConversationId, setClientConversationId] = useState(clientSeeds[0].id);
  const [previewFiles, setPreviewFiles] = useState<FileAttachment[]>([]);
  const [uploadingFiles] = useState<UploadingFile[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isConversationDetailsOpen, setIsConversationDetailsOpen] = useState(false);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, ChatMessageUI[]>>(() => (
    Object.fromEntries([...practiceSeeds, ...clientSeeds].map((seed) => [seed.id, seed.messages.map(mapSeedMessageToChat)]))
  ));

  const isPractice = workspaceKind === 'practice';
  const seeds = isPractice ? practiceSeeds : clientSeeds;
  const conversations = useMemo(() => seeds.map(mapSeedToConversation), [seeds]);
  const previews = useMemo(() => buildPreviews(seeds), [seeds]);
  const activeConversationId = isPractice ? practiceConversationId : clientConversationId;
  const activeConversation = conversations.find((item) => item.id === activeConversationId) ?? conversations[0] ?? null;
  const activeMessages = activeConversation ? (messagesByConversation[activeConversation.id] ?? []) : [];

  const setActiveConversation = (conversationId: string) => {
    if (isPractice) {
      setPracticeConversationId(conversationId);
      return;
    }
    setClientConversationId(conversationId);
    setClientView('conversation');
  };

  const handleSendMessage = (content: string, attachments: FileAttachment[]) => {
    const trimmedContent = content.trim();
    if (!activeConversation || (!trimmedContent && attachments.length === 0)) return;
    const nextMessage: ChatMessageUI = {
      id: `debug-${Date.now()}`,
      role: 'user',
      content: trimmedContent,
      timestamp: Date.now(),
      reply_to_message_id: null,
      metadata: attachments.length > 0 ? { attachments: attachments.map((item) => item.id ?? item.name) } : undefined,
      isUser: true,
      files: attachments,
    };
    setMessagesByConversation((prev) => ({
      ...prev,
      [activeConversation.id]: [...(prev[activeConversation.id] ?? []), nextMessage],
    }));
    setPreviewFiles([]);
  };

  const chatView = (
    <ChatContainer
      messages={activeMessages}
      conversationTitle={activeConversation?.user_info?.title as string | null}
      onSendMessage={handleSendMessage}
      conversationMode="ASK_QUESTION"
      isPublicWorkspace={false}
      practiceConfig={{
        name: PRACTICE_NAME,
        profileImage: PRACTICE_LOGO,
        practiceId: PRACTICE_ID,
      }}
      layoutMode={layoutMode}
      useFrame={layoutMode === 'desktop'}
      heightClassName="h-full"
      headerContent={
        <WorkspaceConversationHeader
          practiceName={PRACTICE_NAME}
          practiceLogo={PRACTICE_LOGO}
          activeLabel="Active"
          presenceStatus="active"
          onBack={() => {
            if (!isPractice) setClientView('list');
          }}
          loading={false}
          rightSlot={isPractice
            ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="icon"
                  size="icon-sm"
                  className="border border-line-glass/30 bg-white/[0.08] hover:bg-white/[0.12]"
                  aria-label="Open conversation details"
                  onClick={() => setIsConversationDetailsOpen(true)}
                >
                  <InformationCircleIcon className="h-4 w-4" aria-hidden="true" />
                </Button>
                <PracticeConversationHeaderMenu practiceId={PRACTICE_ID} conversationId={activeConversation?.id} />
              </div>
            )
            : (
              <Button
                type="button"
                variant="icon"
                size="icon-sm"
                className="border border-line-glass/30 bg-white/[0.08] hover:bg-white/[0.12]"
                aria-label="Open conversation details"
                onClick={() => setIsConversationDetailsOpen(true)}
              >
                <InformationCircleIcon className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
        />
      }
      previewFiles={previewFiles}
      uploadingFiles={uploadingFiles}
      removePreviewFile={(index) => {
        setPreviewFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
      }}
      clearPreviewFiles={() => setPreviewFiles([])}
      handleFileSelect={async (_files: File[]) => undefined}
      handleCameraCapture={async (_file: File) => undefined}
      cancelUpload={(_fileId: string) => undefined}
      handleMediaCapture={(_blob: Blob, _type: 'audio' | 'video') => undefined}
      isRecording={isRecording}
      setIsRecording={setIsRecording}
      isReadyToUpload
      isSessionReady
      isSocketReady
      messagesReady
    />
  );

  return (
    <main className="mx-auto max-w-[1480px] space-y-4 p-4 md:p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <ChatBubbleLeftRightIcon className="h-6 w-6 text-accent-500" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-input-text">Debug Conversations</h1>
          <span className="rounded-full border border-line-glass/30 bg-surface-panel/60 px-2.5 py-1 text-xs font-medium text-input-placeholder">
            No API
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={isPractice ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => {
              setWorkspaceKind('practice');
              setClientView('list');
            }}
          >
            Practice view
          </Button>
          <Button
            variant={!isPractice ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => {
              setWorkspaceKind('client');
              setClientView('list');
            }}
          >
            Client view
          </Button>
        </div>
      </header>

      <section className="h-[78vh] min-h-[680px]">
        <WorkspacePage
          view={isPractice ? 'conversation' : clientView}
          practiceId={PRACTICE_ID}
          practiceSlug={PRACTICE_SLUG}
          practiceName={PRACTICE_NAME}
          practiceLogo={PRACTICE_LOGO}
          messages={activeMessages}
          layoutMode={layoutMode}
          workspace={isPractice ? 'practice' : 'client'}
          onStartNewConversation={async () => {
            const nextId = conversations[0]?.id ?? activeConversationId;
            setActiveConversation(nextId);
            return nextId;
          }}
          activeConversationId={activeConversationId}
          chatView={chatView}
          mockConversations={conversations}
          mockConversationPreviews={previews}
          onSelectConversationOverride={setActiveConversation}
          onCloseConversationListOverride={() => {
            if (!isPractice) {
              setClientView('list');
            }
          }}
        />
      </section>

      <Modal
        isOpen={isConversationDetailsOpen}
        onClose={() => setIsConversationDetailsOpen(false)}
        title="Conversation details"
        type={isMobile ? 'drawer' : 'drawer-right'}
      >
        <div className="space-y-4 text-sm text-input-text">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="glass-panel rounded-lg p-3">
              <div className="text-xs uppercase tracking-wide text-input-placeholder">Workspace</div>
              <div className="mt-1 font-semibold capitalize">{workspaceKind}</div>
            </div>
            <div className="glass-panel rounded-lg p-3">
              <div className="text-xs uppercase tracking-wide text-input-placeholder">Conversation ID</div>
              <div className="mt-1 break-all font-mono text-xs">{activeConversationId}</div>
            </div>
          </div>
          {activeConversation?.user_info?.title ? (
            <div className="glass-panel rounded-lg p-3">
              <div className="text-xs uppercase tracking-wide text-input-placeholder">Title</div>
              <div className="mt-1 font-semibold">{String(activeConversation.user_info.title)}</div>
            </div>
          ) : null}
        </div>
      </Modal>
    </main>
  );
}
