import { render, waitFor } from '@testing-library/preact';
import type { ComponentChildren } from 'preact';
import { describe, expect, it, vi } from 'vitest';
import { WidgetApp } from '@/app/WidgetApp';

const { mockInitializeAccentColor, mockShowError } = vi.hoisted(() => ({
  mockInitializeAccentColor: vi.fn(),
  mockShowError: vi.fn(),
}));

vi.mock('@/shared/utils/accentColors', () => ({
  initializeAccentColor: mockInitializeAccentColor,
}));

vi.mock('@/shared/i18n/hooks', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/shared/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children?: ComponentChildren;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/shared/ui/Icon', () => ({
  Icon: () => <span aria-hidden="true" />,
}));

vi.mock('@heroicons/react/24/outline', () => ({
  XMarkIcon: () => <svg aria-hidden="true" />,
  HomeIcon: () => <svg aria-hidden="true" />,
  ChatBubbleLeftRightIcon: () => <svg aria-hidden="true" />,
  InformationCircleIcon: () => <svg aria-hidden="true" />,
}));

vi.mock('@/features/chat/components/ChatContainer', () => ({
  default: () => <div data-testid="chat-container" />,
}));

vi.mock('@/shared/ui/inspector/InspectorPanel', () => ({
  default: () => <div data-testid="inspector-panel" />,
}));

vi.mock('@/features/chat/views/WorkspaceHomeView', () => ({
  default: () => <div data-testid="workspace-home-view" />,
}));

vi.mock('@/features/chat/views/WidgetConversationListView', () => ({
  default: () => <div data-testid="widget-conversation-list-view" />,
}));

vi.mock('@/shared/contexts/ToastContext', () => ({
  useToastContext: () => ({
    showError: mockShowError,
  }),
}));

vi.mock('@/shared/hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: [],
    isLoading: false,
  }),
}));

vi.mock('@/shared/hooks/useMessageHandling', () => ({
  useMessageHandling: () => ({
    messages: [],
    conversationMetadata: null,
    sendMessage: vi.fn(),
    addMessage: vi.fn(),
    clearMessages: vi.fn(),
    requestMessageReactions: vi.fn(),
    toggleMessageReaction: vi.fn(),
    intakeStatus: null,
    intakeConversationState: null,
    handleIntakeCtaResponse: vi.fn(),
    slimContactDraft: null,
    handleSlimFormContinue: vi.fn(),
    handleBuildBrief: vi.fn(),
    handleSubmitNow: vi.fn(),
    handleFinalizeSubmit: vi.fn(),
    startConsultFlow: vi.fn(),
    updateConversationMetadata: vi.fn(),
    isConsultFlowActive: false,
    ingestServerMessages: vi.fn(),
    messagesReady: true,
    hasMoreMessages: false,
    isLoadingMoreMessages: false,
    loadMoreMessages: vi.fn(),
    isSocketReady: false,
    applyIntakeFields: vi.fn(),
  }),
}));

vi.mock('@/shared/hooks/useConversationSystemMessages', () => ({
  useConversationSystemMessages: vi.fn(() => ({
    persistSystemMessage: vi.fn(),
  })),
}));

vi.mock('@/shared/lib/conversationApi', () => ({
  fetchLatestConversationMessage: vi.fn(),
}));

vi.mock('@/shared/utils/widgetEvents', () => ({
  postToParentFrame: vi.fn(),
  resolveAllowedParentOrigins: () => [],
}));

vi.mock('@/shared/utils/keyboard', () => ({
  setupGlobalKeyboardListeners: () => () => {},
}));

vi.mock('@/features/matters/utils/formatRelativeTime', () => ({
  formatRelativeTime: () => 'just now',
}));

vi.mock('@/shared/utils/conversationDisplay', () => ({
  resolveConversationDisplayTitle: () => 'Conversation',
}));

vi.mock('@/shared/hooks/usePracticeDetails', () => ({
  usePracticeDetails: () => ({
    details: null,
  }),
}));

vi.mock('@/shared/stores/practiceDetailsStore', () => ({
  practiceDetailsStore: {},
}));

vi.mock('@nanostores/preact', () => ({
  useStore: () => ({}),
}));

vi.mock('@/shared/ui/nav/NavRail', () => ({
  NavRail: () => <div data-testid="nav-rail" />,
}));

vi.mock('@/shared/ui/DragDropOverlay', () => ({
  default: () => null,
}));

vi.mock('@/shared/utils/workspaceDetailNavigation', () => ({
  shouldShowWorkspaceDetailBack: () => false,
}));

vi.mock('@/shared/utils/intakeStrength', () => ({
  resolveStrengthStyle: () => ({ percent: 0, ringClass: '' }),
  resolveStrengthTier: () => 'none',
}));

vi.mock('@/shared/ui/layout/DetailHeader', () => ({
  DetailHeader: () => <div data-testid="detail-header" />,
}));

vi.mock('@/shared/utils/consultationState', () => ({
  resolveConsultationState: () => null,
}));

vi.mock('@/shared/ui/inspector/MobileInspectorOverlay', () => ({
  MobileInspectorOverlay: ({ children }: { children?: ComponentChildren }) => <>{children}</>,
}));

vi.mock('@/config/features', () => ({
  features: {
    enableFileAttachments: false,
  },
}));

const buildPracticeConfig = (accentColor: string) => ({
  id: 'practice-1',
  slug: 'test-practice',
  name: 'Test Practice',
  profileImage: null,
  description: '',
  availableServices: [],
  serviceQuestions: {},
  domain: '',
  brandColor: '#000000',
  accentColor,
  voice: {
    enabled: false,
    provider: 'cloudflare' as const,
    voiceId: null,
    displayName: null,
    previewUrl: null,
  },
});

describe('WidgetApp accent theming', () => {
  it('applies the incoming practice accent color on mount and when it changes', async () => {
    const { rerender } = render(
      <WidgetApp
        practiceId="practice-1"
        practiceConfig={buildPracticeConfig('#123456')}
      />
    );

    await waitFor(() => {
      expect(mockInitializeAccentColor).toHaveBeenCalledWith('#123456');
    });

    rerender(
      <WidgetApp
        practiceId="practice-1"
        practiceConfig={buildPracticeConfig('purple')}
      />
    );

    await waitFor(() => {
      expect(mockInitializeAccentColor).toHaveBeenLastCalledWith('purple');
    });
  });
});
