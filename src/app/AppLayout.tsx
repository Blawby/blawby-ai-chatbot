import { FunctionComponent } from 'preact';
import type { ComponentChildren } from 'preact';
import { useRef, useEffect, useCallback, useState, useMemo } from 'preact/hooks';
import { motion, AnimatePresence } from 'framer-motion';
import { ErrorBoundary } from './ErrorBoundary';
import { PracticeNotFound } from '@/features/practice/components/PracticeNotFound';
import LeftSidebar from '@/shared/components/LeftSidebar';
// Onboarding is now routed via /business-onboarding
import MobileTopNav from '@/shared/components/MobileTopNav';
import MediaSidebar from '@/features/media/components/MediaSidebar';
import PracticeProfile from '@/features/practice/components/PracticeProfile';
import { DebugOverlay } from '@/shared/components/DebugOverlay';
import { features } from '@/config/features';
import { ChatMessageUI, FileAttachment } from '../../worker/types';
import { useNavbarScroll } from '@/shared/hooks/useChatScroll';
import { UserIcon } from "@heroicons/react/24/outline";
import { Button } from '@/shared/ui/Button';
import ActivityTimeline from '@/features/matters/components/ActivityTimeline';
import MatterTab from '@/features/matters/components/MatterTab';
import { useMatterState } from '@/shared/hooks/useMatterState';
import { analyzeMissingInfo } from '@/shared/utils/matterAnalysis';
import { THEME } from '@/shared/utils/constants';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useNavigation } from '@/shared/utils/navigation';
import { useLocation } from 'preact-iso';
import type { BusinessOnboardingStatus } from '@/shared/hooks/usePracticeManagement';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import Modal from '@/shared/components/Modal';
import { usePaymentUpgrade } from '@/shared/hooks/usePaymentUpgrade';
import type { WorkspaceType } from '@/shared/types/workspace';
import type { SubscriptionTier } from '@/shared/types/user';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useLocalOnboardingProgress } from '@/shared/hooks/useLocalOnboardingProgress';
import { getActiveOrganizationId } from '@/shared/utils/session';

// Simple messages object for localization
const messages = {
  findLawyer: 'Find Lawyer'
};

interface AppLayoutProps {
  workspace: WorkspaceType;
  practiceNotFound: boolean;
  practiceId: string;
  onRetryPracticeConfig: () => void;
  currentTab: 'dashboard' | 'chats' | 'matter';
  onTabChange: (tab: 'dashboard' | 'chats' | 'matter') => void;
  isMobileSidebarOpen: boolean;
  onToggleMobileSidebar: (open: boolean) => void;
  isSettingsModalOpen?: boolean;
  practiceConfig: {
    name: string;
    profileImage: string | null;
    description?: string | null;
  };
  currentPractice?: {
    id: string;
    subscriptionTier?: SubscriptionTier;
    businessOnboardingStatus?: BusinessOnboardingStatus;
    businessOnboardingCompletedAt?: number | null;
    businessOnboardingHasDraft?: boolean;
  } | null;
  messages: ChatMessageUI[];
  onRequestConsultation?: () => void | Promise<void>;
  onSendMessage?: (message: string) => void;
  onUploadDocument?: (files: File[], metadata?: { documentType?: string; matterId?: string }) => Promise<FileAttachment[]>;
  dashboardContent?: ComponentChildren;
  chatSidebarContent?: ComponentChildren;
  children: ComponentChildren; // ChatContainer component
  onOnboardingCompleted?: () => Promise<void> | void;
}

const AppLayout: FunctionComponent<AppLayoutProps> = ({
  workspace,
  practiceNotFound,
  practiceId,
  onRetryPracticeConfig,
  currentTab,
  onTabChange,
  isMobileSidebarOpen,
  onToggleMobileSidebar,
  isSettingsModalOpen = false,
  practiceConfig,
  currentPractice,
  messages: chatMessages,
  onRequestConsultation,
  onSendMessage,
  onUploadDocument,
  dashboardContent,
  chatSidebarContent,
  children,
  onOnboardingCompleted: _onOnboardingCompleted
}) => {
  // Matter state management
  const { matter, status: matterStatus } = useMatterState(chatMessages);
  const { showError } = useToastContext();
  const { navigate } = useNavigation();
  const location = useLocation();
  const { openBillingPortal } = usePaymentUpgrade();
  const [matterAction, setMatterAction] = useState<'pay' | 'pdf' | 'share' | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  const showDashboardTab = workspace !== 'public';
  const showChatsTab = workspace !== 'public';
  const showRightSidebar = workspace !== 'client';

  // Activity is feature-flagged off by default while we decide the final architecture.
  // TODO(activity): migrate activity source-of-truth to staging-api and remove Worker/D1 dependency.
  const showActivity = features.enableActivity;
  
  // Mobile detection using shared hook
  const isMobile = useMobileDetection();

  const openMatterAction = useCallback((action: 'pay' | 'pdf' | 'share') => {
    setShareCopied(false);
    setMatterAction(action);
  }, []);

  const closeMatterAction = useCallback(() => {
    setMatterAction(null);
  }, []);

  const shareText = useMemo(() => {
    if (!matter) return '';
    const summary = matter.matterSummary ? matter.matterSummary.trim() : '';
    const header = `Matter ${matter.matterNumber || 'Summary'}: ${matter.service}`;
    return [header, summary].filter(Boolean).join('\n\n');
  }, [matter]);

  const handleCopyShareText = useCallback(async () => {
    if (!shareText) return;
    try {
      await navigator.clipboard.writeText(shareText);
      setShareCopied(true);
    } catch (error) {
      console.error('Failed to copy matter summary:', error);
      showError('Copy failed', 'We could not copy the summary to your clipboard.');
    }
  }, [shareText, showError]);

  const handleOpenBilling = useCallback(async () => {
    if (!currentPractice?.id) {
      showError('No practice selected', 'Select a practice to manage billing.');
      return;
    }
    await openBillingPortal({
      practiceId: currentPractice.id,
      returnUrl: `${window.location.origin}/settings/account?sync=1`
    });
    closeMatterAction();
  }, [closeMatterAction, currentPractice?.id, openBillingPortal, showError]);

  const handleOpenChat = useCallback(() => {
    onTabChange('chats');
    closeMatterAction();
  }, [closeMatterAction, onTabChange]);
  
  // Focus management for mobile sidebar
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const mobileSidebarRef = useRef<HTMLDivElement>(null);
  
  // Handle focus management when mobile sidebar opens/closes
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    
    if (isMobileSidebarOpen) {
      // Store the currently focused element
      previousActiveElement.current = document.activeElement as HTMLElement;
      
      // Focus the first interactive element in the sidebar after a brief delay
      // to ensure the sidebar is fully rendered
      timeoutId = setTimeout(() => {
        // Verify the sidebar and element still exist before focusing
        if (mobileSidebarRef.current && isMobileSidebarOpen) {
          const firstButton = mobileSidebarRef.current.querySelector('button');
          if (firstButton) {
            firstButton.focus();
          }
        }
      }, 100);
    } else if (previousActiveElement.current) {
      // Restore focus to the previously focused element when sidebar closes
      previousActiveElement.current.focus();
      previousActiveElement.current = null;
    }
    
    // Cleanup function to clear timeout
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isMobileSidebarOpen]);

  // Handle Escape key to close mobile sidebar from anywhere
  useEffect(() => {
    if (!isMobileSidebarOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onToggleMobileSidebar(false);
      }
    };

    // Add document-level listener for Escape key
    document.addEventListener('keydown', handleEscape);

    // Cleanup listener when sidebar closes or component unmounts
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMobileSidebarOpen, onToggleMobileSidebar]);
  
  // Tab switching handlers
  const handleGoToDashboard = () => {
    onTabChange('dashboard');
  };

  const handleGoToChats = () => {
    onTabChange('chats');
  };

  // Enhanced handler for continuing in chat with context
  const handleContinueInChat = () => {
    // Switch to chat tab first
    onTabChange('chats');
    
    // If we have missing information and can send a message, provide context
    if (matter && matterStatus === 'incomplete' && onSendMessage) {
      // Analyze what's missing to provide helpful context
      const missingInfo = analyzeMissingInfo(matter);
      
      if (missingInfo.length > 0) {
        // Create a contextual message to help the agent guide the user
        const contextMessage = `I need help completing my ${matter.service} matter. I'm missing some information: ${missingInfo.slice(0, 3).join(', ')}${missingInfo.length > 3 ? `, and ${missingInfo.length - 3} more items` : ''}. Can you help me provide the missing details?`;
        
        // Send the message after a short delay to ensure the chat tab is loaded
        setTimeout(() => {
          onSendMessage(contextMessage);
        }, 100);
      }
    }
  };
  

  useEffect(() => {
    const allowedTabs: Array<'dashboard' | 'chats' | 'matter'> = ['matter'];
    if (showChatsTab) allowedTabs.push('chats');
    if (showDashboardTab) allowedTabs.push('dashboard');
    const fallbackTab = showDashboardTab
      ? 'dashboard'
      : showChatsTab
        ? 'chats'
        : 'matter';
    if (!allowedTabs.includes(currentTab) && currentTab !== fallbackTab) {
      onTabChange(fallbackTab);
    }
  }, [currentTab, onTabChange, showChatsTab, showDashboardTab]);
  const { isNavbarVisible } = useNavbarScroll({ 
    threshold: 50, 
    debounceMs: 0
  });

  const handleOpenOnboarding = useCallback(() => {
    const targetPracticeId = currentPractice?.id || practiceId;
    if (!targetPracticeId) {
      showError('Practice loading', 'Select a practice before starting onboarding.');
      return;
    }
    // If launching from settings, replace directly to onboarding (single history replace)
    if (location.path.startsWith('/settings')) {
      navigate(`/business-onboarding?practiceId=${encodeURIComponent(targetPracticeId)}`, true);
    } else {
      // Otherwise push normally to preserve previous page in history
      navigate(`/business-onboarding?practiceId=${encodeURIComponent(targetPracticeId)}`);
    }
  }, [currentPractice?.id, practiceId, showError, navigate, location.path]);

  const { session } = useSessionContext();
  const organizationId = useMemo(() => getActiveOrganizationId(session), [session]);
  const localOnboardingProgress = useLocalOnboardingProgress(organizationId);

  if (practiceNotFound) {
    return <PracticeNotFound practiceId={practiceId} onRetry={onRetryPracticeConfig} />;
  }

  // Async-safe wrapper for consultation request
  const handleRequestConsultation = async () => {
    if (!onRequestConsultation) return;
    
    try {
      await onRequestConsultation();
    } catch (_error) {
      // Surface error to user - could be enhanced with a toast notification
      // For now, silently handle the error
      // console.error('Error requesting consultation:', _error);
    }
  };

  const canShowOnboarding = workspace === 'practice';
  const onboardingStatus = canShowOnboarding
    ? (localOnboardingProgress?.status ?? 'pending')
    : undefined;
  const hasOnboardingDraft = canShowOnboarding ? (localOnboardingProgress?.hasDraft ?? false) : false;
  const _onboardingPracticeId = currentPractice?.id;

  return (
    <div className="max-md:h-[100dvh] md:h-screen w-full flex bg-white dark:bg-dark-bg">
      {/* Left Sidebar - Desktop: always visible, Mobile: slide-out, Hidden when settings modal is open on mobile */}
      {features.enableLeftSidebar && !(isMobile && isSettingsModalOpen) && (
        <>
          {/* Desktop Sidebar */}
          <div className="overflow-y-auto hidden lg:block">
            <LeftSidebar
              currentRoute={currentTab}
              showDashboardTab={showDashboardTab}
              showChatsTab={showChatsTab}
              onGoToDashboard={showDashboardTab ? handleGoToDashboard : undefined}
              onGoToChats={showChatsTab ? handleGoToChats : undefined}
              onOpenOnboarding={canShowOnboarding ? handleOpenOnboarding : undefined}
              chatSidebarContent={chatSidebarContent}
              practiceConfig={{
                name: practiceConfig.name,
                profileImage: practiceConfig.profileImage,
                practiceId
              }}
              currentPractice={currentPractice}
              onboardingStatus={onboardingStatus}
              onboardingHasDraft={hasOnboardingDraft}
            />
          </div>
          
          {/* Mobile Sidebar - Conditionally rendered for accessibility */}
          <AnimatePresence>
            {isMobileSidebarOpen && (
              <motion.div 
                ref={mobileSidebarRef} 
                className="fixed inset-0 lg:hidden" 
                style={{ zIndex: THEME.zIndex.fileMenu }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {/* Overlay */}
                <button 
                  className="absolute inset-0 bg-black/50 backdrop-blur-sm w-full h-full focus:outline-none focus:ring-2 focus:ring-accent-500"
                  onClick={() => onToggleMobileSidebar(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onToggleMobileSidebar(false);
                    }
                  }}
                  aria-label="Close mobile sidebar"
                  type="button"
                />
                {/* Sidebar */}
                <motion.div 
                  className="relative w-64 h-full overflow-y-auto overscroll-contain bg-light-card-bg dark:bg-dark-card-bg"
                  initial={{ x: -256 }}
                  animate={{ x: 0 }}
                  exit={{ x: -256 }}
                  transition={{ 
                    type: "spring", 
                    stiffness: 300, 
                    damping: 30 
                  }}
                >
                  <LeftSidebar
                    currentRoute={currentTab}
                    showDashboardTab={showDashboardTab}
                    showChatsTab={showChatsTab}
                    onGoToDashboard={showDashboardTab ? () => {
                      handleGoToDashboard();
                      onToggleMobileSidebar(false);
                    } : undefined}
                    onGoToChats={showChatsTab ? () => {
                      handleGoToChats();
                      onToggleMobileSidebar(false);
                    } : undefined}
                    onOpenOnboarding={canShowOnboarding ? () => {
                      handleOpenOnboarding();
                      onToggleMobileSidebar(false);
                    } : undefined}
                    onClose={() => onToggleMobileSidebar(false)}
                    chatSidebarContent={chatSidebarContent}
                    practiceConfig={{
                      name: practiceConfig.name,
                      profileImage: practiceConfig.profileImage,
                      practiceId
                    }}
                    currentPractice={currentPractice}
                    onboardingStatus={onboardingStatus}
                    onboardingHasDraft={hasOnboardingDraft}
                  />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Main Content Area - Flex grow, full width on mobile */}
      <div className="flex-1 bg-white dark:bg-dark-bg overflow-y-auto">
        <ErrorBoundary>
          {currentTab === 'dashboard' ? (
            <div className="h-full">
              {dashboardContent ?? (
                <div className="h-full flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                  Dashboard coming soon.
                </div>
              )}
            </div>
          ) : currentTab === 'chats' ? (
            children
          ) : (
            <div className="h-full">
              <MatterTab
                matter={matter}
                status={matterStatus}
                onStartChat={handleGoToChats}
                onViewInChat={handleContinueInChat}
                onPayNow={() => {
                  openMatterAction('pay');
                }}
                onViewPDF={() => {
                  openMatterAction('pdf');
                }}
                onShareMatter={() => {
                  openMatterAction('share');
                }}
                onUploadDocument={onUploadDocument}
              />
            </div>
          )}
        </ErrorBoundary>
      </div>

      {/* Right Sidebar - Fixed width, hidden on mobile */}
      {showRightSidebar && (
        <div className="w-80 overflow-y-auto scrollbar-hide hidden lg:block p-2">
          <div className="bg-light-card-bg dark:bg-dark-card-bg rounded-lg p-6 text-gray-900 dark:text-white flex flex-col gap-6 h-full">
            <PracticeProfile
              name={practiceConfig.name}
              profileImage={practiceConfig.profileImage}
              practiceId={practiceId}
              description={practiceConfig.description}
              variant="sidebar"
              showVerified={true}
            />

            {/* Request Consultation Button - Primary Action */}
            {onRequestConsultation && (
              <div className="flex flex-col gap-3 pt-2">
                <Button
                  onClick={handleRequestConsultation}
                  variant="primary"
                  type="button"
                  icon={<UserIcon className="w-4 h-4" />}
                >
                  {messages.findLawyer}
                </Button>
              </div>
            )}

            {/* Activity Timeline Section */}
            {showActivity && <ActivityTimeline practiceId={practiceId} />}

            {/* Media Section */}
            <MediaSidebar messages={chatMessages} />
          </div>
        </div>
      )}


      <MobileTopNav
        onOpenSidebar={() => onToggleMobileSidebar(true)}
        onPlusClick={() => {
          window.location.hash = '#pricing';
        }}
        isVisible={isNavbarVisible}
      />

      {/* Debug Overlay - Only when explicitly enabled */}
      {import.meta.env.VITE_DEBUG_OVERLAY === 'true' && (
        <DebugOverlay isVisible={true} />
      )}

      <Modal
        isOpen={Boolean(matterAction)}
        onClose={closeMatterAction}
        title={
          matterAction === 'pay'
            ? 'Matter Payment'
            : matterAction === 'pdf'
              ? 'Matter PDF'
              : matterAction === 'share'
                ? 'Share Matter'
                : 'Matter Actions'
        }
        type="modal"
      >
        {matterAction === 'pay' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Use the billing portal to handle payments for this matter. We will keep your subscription and invoices in sync.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => navigate('/cart')}>
                View plans
              </Button>
              <Button variant="primary" onClick={() => { void handleOpenBilling(); }}>
                Open billing portal
              </Button>
            </div>
          </div>
        )}

        {matterAction === 'pdf' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Generate a case summary PDF from the current chat context.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={handleOpenChat}>
                Open chat
              </Button>
              <Button variant="primary" onClick={handleOpenChat}>
                Generate PDF in chat
              </Button>
            </div>
          </div>
        )}

        {matterAction === 'share' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Share a concise matter summary with your team or client.
            </p>
            <div className="rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-card-bg p-3 text-xs text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
              {shareText || 'No summary available yet.'}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={handleCopyShareText} disabled={!shareText}>
                {shareCopied ? 'Copied' : 'Copy summary'}
              </Button>
              <Button variant="primary" onClick={() => navigate('/settings/practice')}>
                Manage team access
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Onboarding modal handled by /business-onboarding route */}
    </div>
  );
};


export default AppLayout; 
