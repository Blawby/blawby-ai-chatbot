// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@/__tests__/test-utils';
import WorkspacePage from '@/features/chat/pages/WorkspacePage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/shared/i18n/hooks', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/shared/hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: [],
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock('@/features/practice-dashboard/hooks/usePracticeBillingData', () => ({
  usePracticeBillingData: () => ({
    summaryStats: null,
    recentActivity: [],
    recentClients: [],
    loading: false,
    error: null,
  }),
}));

vi.mock('@/shared/hooks/usePracticeManagement', () => ({
  usePracticeManagement: () => ({
    currentPractice: null,
    updatePractice: vi.fn(),
  }),
}));

vi.mock('@/shared/hooks/usePracticeDetails', () => ({
  usePracticeDetails: () => ({
    details: null,
    updateDetails: vi.fn(),
    fetchDetails: vi.fn(),
  }),
}));

vi.mock('@/shared/hooks/useMessageHandling', () => ({
  useMessageHandling: () => ({
    messages: [],
    sendMessage: vi.fn(),
    messagesReady: true,
    isSocketReady: true,
    hasMoreMessages: false,
    isLoadingMoreMessages: false,
    loadMoreMessages: vi.fn(),
    toggleMessageReaction: vi.fn(),
    requestMessageReactions: vi.fn(),
  }),
}));

vi.mock('@/shared/lib/conversationApi', () => ({
  fetchLatestConversationMessage: vi.fn().mockResolvedValue(null),
  updateConversationMetadata: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/shared/contexts/ToastContext', () => ({
  useToastContext: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showInfo: vi.fn(),
  }),
}));

vi.mock('@/shared/contexts/SessionContext', () => ({
  useSessionContext: () => ({
    session: { user: { id: 'user-1', name: 'Test User', email: 'test@example.com' } },
    isPending: false,
  }),
}));

const renderPage = (workspace: 'practice' | 'client') => {
  cleanup();
  return render(
    <WorkspacePage
      view="invoiceDetail"
      practiceId="practice-1"
      practiceSlug="demo-practice"
      messages={[]}
      layoutMode={workspace === 'practice' ? 'desktop' : 'mobile'}
      showClientTabs
      showPracticeTabs={workspace === 'practice'}
      workspace={workspace}
      onStartNewConversation={vi.fn().mockResolvedValue('c-1')}
      chatView={<div>chat</div>}
      invoicesView={<div>detail</div>}
    />
  );
};

describe('WorkspacePage invoices tab on detail routes', () => {
  it('keeps invoices tab active for practice invoice detail view', () => {
    renderPage('practice');
    const invoicesTabs = screen.getAllByRole('button', { name: 'workspace.navigation.invoices' });
    expect(invoicesTabs.length).toBeGreaterThan(0);
    for (const tab of invoicesTabs) {
      expect(tab.getAttribute('aria-current')).toBe('page');
    }
  });

  it('keeps invoices tab active for client invoice detail view', () => {
    renderPage('client');
    const invoicesTabs = screen.getAllByRole('button', { name: 'workspace.navigation.invoices' });
    expect(invoicesTabs.length).toBeGreaterThan(0);
    for (const tab of invoicesTabs) {
      expect(tab.getAttribute('aria-current')).toBe('page');
    }
  });
});
