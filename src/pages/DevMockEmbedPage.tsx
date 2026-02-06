import { FunctionComponent } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import ChatContainer from '@/features/chat/components/ChatContainer';
import PublicConversationHeader from '@/features/chat/components/PublicConversationHeader';
import PublicEmbedHome from '@/features/chat/components/PublicEmbedHome';
import PublicEmbedNavigation from '@/features/chat/components/PublicEmbedNavigation';
import PublicConversationList from '@/features/chat/components/PublicConversationList';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import type { ChatMessageUI } from '../../worker/types';
import type { Conversation } from '@/shared/types/conversation';
import { useNavigation } from '@/shared/utils/navigation';
import { IntakePaymentModal } from '@/features/intake/components/IntakePaymentModal';
import { asMinor } from '@/shared/utils/money';

type MockView = 'home' | 'list' | 'conversation' | 'matters';

const mockPractice = {
  id: 'practice-demo-001',
  slug: 'demo-firm',
  name: "Chris Luke's Awesome Legal Firm",
  logo: null as string | null
};

const mockConversations: Conversation[] = [
  {
    id: 'conversation-001',
    practice_id: mockPractice.id,
    practice: {
      id: mockPractice.id,
      name: mockPractice.name,
      slug: mockPractice.slug
    },
    user_id: 'user-demo-001',
    matter_id: null,
    participants: ['user-demo-001'],
    user_info: {
      title: 'Chris Luke',
      mode: 'ASK_QUESTION'
    },
    status: 'active',
    last_message_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 12).toISOString()
  },
  {
    id: 'conversation-002',
    practice_id: mockPractice.id,
    practice: {
      id: mockPractice.id,
      name: mockPractice.name,
      slug: mockPractice.slug
    },
    user_id: 'user-demo-001',
    matter_id: null,
    participants: ['user-demo-001'],
    user_info: {
      title: 'Chris Luke',
      mode: 'REQUEST_CONSULTATION'
    },
    status: 'active',
    last_message_at: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 40).toISOString()
  }
];

const mockPreviews: Record<string, { content: string; role: string; createdAt: string }> = {
  'conversation-001': {
    content: 'Thanks for reaching out. I can help with your contract review. Want to share details?',
    role: 'assistant',
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString()
  },
  'conversation-002': {
    content: 'I need help with a landlord dispute and would like to request a consultation.',
    role: 'user',
    createdAt: new Date(Date.now() - 1000 * 60 * 40).toISOString()
  }
};

const mockMessages: ChatMessageUI[] = [
  {
    id: 'message-001',
    role: 'assistant',
    content: "Hi! I'm Blawby, the AI legal assistant. How can we help today?",
    timestamp: Date.now() - 1000 * 60 * 50,
    isUser: false
  },
  {
    id: 'message-002',
    role: 'user',
    content: 'I need to review a consulting agreement before signing.',
    timestamp: Date.now() - 1000 * 60 * 45,
    isUser: true
  },
  {
    id: 'message-003',
    role: 'assistant',
    content: 'Absolutely. I can summarize key risks and recommend changes. Do you have a PDF handy?',
    timestamp: Date.now() - 1000 * 60 * 42,
    isUser: false
  }
];

const noopPromise = async () => undefined;
const noop = () => undefined;

const MockEmbedPanel: FunctionComponent<{ title: string; showClientTabs: boolean }> = ({
  title,
  showClientTabs
}) => {
  const { navigate } = useNavigation();
  const [view, setView] = useState<MockView>('home');
  const [activeConversationId, setActiveConversationId] = useState<string>(mockConversations[0].id);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [showIntakeForm, setShowIntakeForm] = useState(false);
  const [showPaymentRequest, setShowPaymentRequest] = useState(false);

  const recentMessage = useMemo(() => {
    const preview = mockPreviews[mockConversations[0].id];
    return {
      preview: preview.content,
      timestampLabel: formatRelativeTime(preview.createdAt),
      senderLabel: mockPractice.name,
      avatarSrc: mockPractice.logo,
      conversationId: mockConversations[0].id
    };
  }, []);

  const activeTab = view === 'list' || view === 'conversation' ? 'messages' : view;
  const showBottomNav = showClientTabs || view === 'home' || view === 'list' || view === 'matters';

  const handleSelectConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
    setShowIntakeForm(false);
    setShowPaymentRequest(false);
    setIsPaymentOpen(false);
    setView('conversation');
  };

  const mockPaymentRequest = useMemo(() => ({
    intakeUuid: 'mock-intake-001',
    checkoutSessionUrl: 'https://checkout.stripe.com/pay/cs_test_mock',
    amount: 7500 as any, // 7500 cents = $75.00
    currency: 'usd',
    practiceName: mockPractice.name,
    practiceLogo: mockPractice.logo,
    practiceSlug: mockPractice.slug,
    practiceId: mockPractice.id,
    conversationId: activeConversationId
  }), [activeConversationId]);

  const chatHeader = (
    <PublicConversationHeader
      practiceName={mockPractice.name}
      practiceLogo={mockPractice.logo}
      onBack={() => setView('list')}
    />
  );

  const mockChatMessages = useMemo(() => {
    const base = [...mockMessages];
    if (showIntakeForm) {
      base.push({
        id: 'message-contact-form',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isUser: false,
        contactForm: {
          fields: ['name', 'email', 'phone', 'address', 'opposingParty', 'description'],
          required: ['name', 'email'],
          message: 'Tell us a bit about your situation.',
          initialValues: {
            name: 'Paul Luke',
            email: 'test@example.com',
            phone: '555-0100',
            address: '123 Test Street, Alexander Beach, WA 98221',
            opposingParty: 'Alex Beach Properties'
          }
        }
      });
    }
    if (showPaymentRequest) {
      base.push({
        id: 'message-payment-request',
        role: 'assistant',
        content: 'One more step: submit the consultation fee to complete your intake.',
        timestamp: Date.now(),
        isUser: false,
        paymentRequest: mockPaymentRequest
      });
    }
    return base;
  }, [showIntakeForm, showPaymentRequest, mockPaymentRequest]);

  const chatView = (
    <div className="flex flex-1 min-h-0 flex-col">
      <ChatContainer
        messages={mockChatMessages}
        onSendMessage={noop}
        onContactFormSubmit={async () => {
          setShowIntakeForm(false);
          setShowPaymentRequest(true);
          setIsPaymentOpen(true);
        }}
        isPublicWorkspace={true}
        practiceConfig={{
          name: mockPractice.name,
          profileImage: mockPractice.logo,
          practiceId: mockPractice.id,
          slug: mockPractice.slug,
          introMessage: 'Share a few details and we will point you in the right direction.'
        }}
        showPracticeHeader={false}
        headerContent={chatHeader}
        useFrame={false}
        practiceId={mockPractice.id}
        previewFiles={[]}
        uploadingFiles={[]}
        removePreviewFile={noop}
        clearPreviewFiles={noop}
        handleFileSelect={noopPromise}
        handleCameraCapture={noopPromise}
        cancelUpload={noop}
        handleMediaCapture={noop}
        isRecording={false}
        setIsRecording={noop}
        isReadyToUpload={true}
        isSessionReady={true}
        isSocketReady={true}
        conversationId={activeConversationId}
        canChat={true}
      />
    </div>
  );

  const renderContent = () => {
    switch (view) {
      case 'home':
        return (
          <PublicEmbedHome
            practiceName={mockPractice.name}
            practiceLogo={mockPractice.logo}
            onSendMessage={() => {
              setView('conversation');
              setIsPaymentOpen(false);
            }}
            onRequestConsultation={() => {
              setView('conversation');
              setShowIntakeForm(true);
              setShowPaymentRequest(false);
              setIsPaymentOpen(false);
            }}
            recentMessage={recentMessage}
            onOpenRecentMessage={() => handleSelectConversation(mockConversations[0].id)}
          />
        );
      case 'list':
        return (
          <PublicConversationList
            conversations={mockConversations}
            previews={mockPreviews}
            practiceName={mockPractice.name}
            practiceLogo={mockPractice.logo}
            isLoading={false}
            onClose={() => setView('home')}
            onSelectConversation={handleSelectConversation}
            onSendMessage={() => setView('conversation')}
          />
        );
      case 'matters':
        return (
          <div className="flex flex-1 flex-col overflow-y-auto rounded-[32px] bg-light-bg dark:bg-dark-bg">
            <div className="px-6 py-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Matters</h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                This is a mock state for client matters.
              </p>
            </div>
            <div className="mx-6 mb-6 rounded-2xl border border-light-border bg-light-card-bg p-5 shadow-[0_16px_32px_rgba(15,23,42,0.12)] dark:border-dark-border dark:bg-dark-card-bg">
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">No matters yet</div>
              <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                Start a conversation to open a new matter with the practice.
              </div>
            </div>
          </div>
        );
      case 'conversation':
      default:
        return chatView;
    }
  };

  return (
    <section className="flex flex-1 flex-col">
      <div className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</div>
      <div className="flex flex-1 min-h-0 w-full items-start justify-center px-3 py-4 bg-light-bg dark:bg-dark-bg rounded-[32px] border border-light-border dark:border-white/20">
        <div className="flex flex-col w-full max-w-[420px] aspect-[9/16] bg-light-bg dark:bg-dark-bg rounded-[32px] shadow-[0_32px_80px_rgba(15,23,42,0.18)] border border-light-border dark:border-white/20 overflow-hidden">
          {renderContent()}
          {showBottomNav && (
            <PublicEmbedNavigation
              activeTab={activeTab}
              showClientTabs={showClientTabs}
              onSelectTab={(tab) => {
                if (tab === 'messages') {
                  setView('list');
                  return;
                }
                if (tab === 'matters') {
                  setView('matters');
                  return;
                }
                if (tab === 'settings') {
                  navigate('/settings');
                  return;
                }
                setView('home');
              }}
            />
          )}
        </div>
      </div>
      <IntakePaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        paymentRequest={isPaymentOpen ? mockPaymentRequest : null}
      />
    </section>
  );
};

const DevMockEmbedPage: FunctionComponent = () => {
  if (!import.meta.env.DEV) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        Not found
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg px-4 py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 lg:flex-row">
        <MockEmbedPanel title="Public Embed (Anonymous)" showClientTabs={false} />
        <MockEmbedPanel title="Client Embed (Authenticated)" showClientTabs={true} />
      </div>
    </div>
  );
};

export default DevMockEmbedPage;
