import { FunctionComponent } from 'preact';
import type { ComponentChildren } from 'preact';
import { useRef, useEffect, useCallback } from 'preact/hooks';
import { motion, AnimatePresence } from 'framer-motion';
import { ErrorBoundary } from './ErrorBoundary';
import { PracticeNotFound } from './PracticeNotFound';
import LeftSidebar from './LeftSidebar';
// Onboarding is now routed via /business-onboarding
import MobileTopNav from './MobileTopNav';
import MediaSidebar from './MediaSidebar';
import PrivacySupportSidebar from './PrivacySupportSidebar';
import PracticeProfile from './PracticeProfile';
import { DebugOverlay } from './DebugOverlay';
import { features } from '../config/features';
import { ChatMessageUI, FileAttachment } from '../../worker/types';
import { useNavbarScroll } from '../hooks/useChatScroll';
import { UserIcon } from "@heroicons/react/24/outline";
import { Button } from './ui/Button';
import ActivityTimeline from './ActivityTimeline';
import MatterTab from './MatterTab';
import { InboxPage } from './settings/pages/InboxPage';
import { useSession } from '../lib/authClient';
import { useMatterState } from '../hooks/useMatterState';
import { analyzeMissingInfo } from '../utils/matterAnalysis';
import { THEME } from '../utils/constants';
import { useToastContext } from '../contexts/ToastContext';
import { useNavigation } from '../utils/navigation';
import { useLocation } from 'preact-iso';
import type { BusinessOnboardingStatus } from '../hooks/usePracticeManagement';
import { useMobileDetection } from '../hooks/useMobileDetection';

// Simple messages object for localization
const messages = {
  findLawyer: 'Find Lawyer'
};

interface AppLayoutProps {
  practiceNotFound: boolean;
  practiceId: string;
  onRetryPracticeConfig: () => void;
  currentTab: 'chats' | 'matter' | 'inbox';
  onTabChange: (tab: 'chats' | 'matter' | 'inbox') => void;
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
    subscriptionTier?: string;
    businessOnboardingStatus?: BusinessOnboardingStatus;
    businessOnboardingCompletedAt?: number | null;
    businessOnboardingHasDraft?: boolean;
  } | null;
  messages: ChatMessageUI[];
  onRequestConsultation?: () => void | Promise<void>;
  onSendMessage?: (message: string) => void;
  onUploadDocument?: (files: File[], metadata?: { documentType?: string; matterId?: string }) => Promise<FileAttachment[]>;
  children: ComponentChildren; // ChatContainer component
  onOnboardingCompleted?: () => Promise<void> | void;
}

const AppLayout: FunctionComponent<AppLayoutProps> = ({
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
  children,
  onOnboardingCompleted: _onOnboardingCompleted
}) => {
  // Matter state management
  const { matter, status: matterStatus } = useMatterState(chatMessages);
  const { showError } = useToastContext();
  const { navigate } = useNavigation();
  const location = useLocation();
  const { data: session } = useSession();
  
  // Show inbox tab for all authenticated users
  // API will enforce member-only access (requires practice member role)
  const showInboxTab = !!session?.user;

  // Activity is feature-flagged off by default while we decide the final architecture.
  // TODO(activity): migrate activity source-of-truth to staging-api and remove Worker/D1 dependency.
  const showActivity = features.enableActivity;
  
  // Mobile detection using shared hook
  const isMobile = useMobileDetection();
  
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
  
  const handleGoToMatter = () => {
    onTabChange('matter');
  };

  const handleGoToInbox = () => {
    onTabChange('inbox');
  };
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

  const onboardingStatus = currentPractice?.businessOnboardingStatus;
  const hasOnboardingDraft = currentPractice?.businessOnboardingHasDraft ?? false;
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
              onGoToChats={handleGoToChats}
              onGoToMatter={handleGoToMatter}
              onGoToInbox={showInboxTab ? handleGoToInbox : undefined}
              onOpenOnboarding={handleOpenOnboarding}
              matterStatus={matterStatus}
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
                    onGoToChats={() => {
                      handleGoToChats();
                      onToggleMobileSidebar(false);
                    }}
                    onGoToMatter={() => {
                      handleGoToMatter();
                      onToggleMobileSidebar(false);
                    }}
                    onGoToInbox={showInboxTab ? () => {
                      handleGoToInbox();
                      onToggleMobileSidebar(false);
                    } : undefined}
                    onOpenOnboarding={() => {
                      handleOpenOnboarding();
                      onToggleMobileSidebar(false);
                    }}
                    onClose={() => onToggleMobileSidebar(false)}
                    matterStatus={matterStatus}
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
          {currentTab === 'chats' ? children : currentTab === 'inbox' ? (
            <div className="h-full">
              <InboxPage className="h-full" />
            </div>
          ) : (
            <div className="h-full">
              <MatterTab
                matter={matter}
                status={matterStatus}
                onStartChat={handleGoToChats}
                onViewInChat={handleContinueInChat}
                onPayNow={() => {/* TODO: Implement payment flow */}}
                onViewPDF={() => {/* TODO: Implement PDF viewing */}}
                onShareMatter={() => {/* TODO: Implement matter sharing */}}
                onUploadDocument={onUploadDocument}
              />
            </div>
          )}
        </ErrorBoundary>
      </div>

      {/* Right Sidebar - Fixed width, hidden on mobile */}
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

          {/* Privacy & Support Section */}
          <PrivacySupportSidebar />
        </div>
      </div>


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

      {/* Onboarding modal handled by /business-onboarding route */}
    </div>
  );
};


export default AppLayout; 
