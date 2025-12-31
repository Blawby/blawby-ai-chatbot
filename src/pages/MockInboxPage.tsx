import { useEffect, useRef, useState, useMemo } from 'preact/hooks';
import { InboxPage } from '@/features/settings/pages/InboxPage';
import { MockInboxControls } from '@/features/inbox/mock/components/MockInboxControls';
import { MockInboxInfo } from '@/features/inbox/mock/components/MockInboxInfo';
import { DebugPanel } from '@/features/chat/mock/components/DebugPanel';
import { useMockInbox } from '@/features/inbox/mock/useMockInbox';
import { SessionContext, type SessionContextValue } from '@/shared/contexts/SessionContext';
import { ToastProvider } from '@/shared/contexts/ToastContext';
import type { Practice } from '@/shared/lib/apiClient';
import type { InboxFilters } from '@/shared/hooks/useInbox';
import type { MockConversation } from '@/features/inbox/mock/types';
import { setToken } from '@/shared/lib/tokenStorage';

const MOCK_PRACTICE_ID = 'mock-practice-inbox';
const mockPractice: Practice = {
  id: MOCK_PRACTICE_ID,
  slug: 'mock-inbox-practice',
  name: 'Mock Inbox Practice',
  description: 'Practice for inbox mock scenarios',
  kind: 'business',
  subscriptionStatus: 'active',
  subscriptionTier: 'business',
  seats: 5,
  subscriptionPeriodEnd: Date.now() / 1000 + 30 * 24 * 60 * 60,
  createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  updatedAt: new Date().toISOString(),
  businessEmail: 'owner@mock-inbox.test',
  businessPhone: '+1-555-0101',
  logo: null,
  businessOnboardingStatus: 'completed',
  businessOnboardingCompletedAt: Date.now() - 1000 * 60 * 60 * 24 * 5,
  businessOnboardingSkipped: false,
  config: {
    ownerEmail: 'owner@mock-inbox.test',
    profileImage: null,
    introMessage: 'Welcome to the mock inbox practice',
    description: 'Mock practice for inbox testing',
    availableServices: ['Litigation', 'Contracts', 'Estate Planning'],
    serviceQuestions: {},
    brandColor: '#6366f1',
    accentColor: '#8b5cf6',
    metadata: {
      subscriptionPlan: 'business',
      planStatus: 'active'
    }
  },
  metadata: {
    conversationConfig: {
      ownerEmail: 'owner@mock-inbox.test',
      introMessage: 'Welcome to the mock inbox practice',
      description: 'Mock practice for inbox testing',
      availableServices: ['Litigation', 'Contracts', 'Estate Planning'],
      serviceQuestions: {},
      domain: '',
      brandColor: '#6366f1',
      accentColor: '#8b5cf6',
      profileImage: null,
      voice: {
        enabled: false,
        provider: 'cloudflare',
        voiceId: null,
        displayName: null,
        previewUrl: null
      },
      metadata: {
        serviceDetails: []
      }
    },
    onboarding: {
      status: 'completed',
      completed: true,
      skipped: false,
      completedAt: Date.now() - 1000 * 60 * 60 * 24 * 5,
      lastSavedAt: Date.now() - 1000 * 60 * 60 * 24 * 5,
      data: {
        firmName: 'Mock Inbox Practice',
        contactEmail: 'owner@mock-inbox.test',
        contactPhone: '+1-555-0101',
        services: [],
        __meta: {
          resumeStep: 'review-and-launch',
          savedAt: Date.now() - 1000 * 60 * 60 * 24 * 5
        }
      }
    }
  }
};

// Mock session data - matches Better Auth's expected format
const mockSession = {
  data: {
    user: {
      id: 'mock-user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      emailVerified: true,
      name: 'Mock Inbox User',
      email: 'owner@mock-inbox.test',
      practiceId: MOCK_PRACTICE_ID,
      activePracticeId: MOCK_PRACTICE_ID
    },
    session: {
      id: 'mock-session-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
      userId: 'mock-user-1',
      token: 'mock-token'
    }
  },
  isPending: false
};

// Mock SessionProvider that provides hardcoded data without API calls
function MockSessionProvider({ children }: { children: preact.ComponentChildren }) {
  const value = useMemo<SessionContextValue>(() => ({
    session: mockSession.data,
    activePracticeId: mockSession.data.user.activePracticeId,
    isLoading: false,
    isAnonymous: false
  }), []);

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function MockInboxPage() {
  const [isDevMode, setIsDevMode] = useState(import.meta.env.DEV || import.meta.env.MODE === 'development');
  const mock = useMockInbox();
  const mockRef = useRef(mock);

  useEffect(() => {
    mockRef.current = mock;
  }, [mock]);

  useEffect(() => {
    const dev = import.meta.env.MODE === 'development' || import.meta.env.DEV;
    setIsDevMode(dev);
    if (!dev) {
      window.location.href = '/';
    }
  }, []);

  // Set mock token for development
  useEffect(() => {
    if (isDevMode) {
      void setToken(mockSession.data.session.token);
    }
  }, [isDevMode]);

  if (!isDevMode) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-500 dark:text-gray-300">
        Redirecting…
      </div>
    );
  }

  return (
    <ToastProvider>
      <MockSessionProvider>
        <div className="flex h-screen bg-white dark:bg-dark-bg">
          <MockInboxControls mock={mock} />

          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
                <div className="mb-4 p-4 border-b border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Mock Inbox Page</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Development-only inbox for testing conversation lists</p>
                </div>
                <InboxPage className="h-[calc(100%-80px)]" />
              </div>
            </div>

            <DebugPanel 
              events={mock.debugEvents.map(event => ({ ...event, data: event.data ?? {} }))} 
              onClear={mock.clearDebugEvents} 
            />
          </div>

          <MockInboxInfo mock={mock} />
        </div>
      </MockSessionProvider>
    </ToastProvider>
  );
}