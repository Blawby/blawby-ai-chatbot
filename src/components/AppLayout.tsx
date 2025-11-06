import { FunctionComponent } from 'preact';
import { useRef, useEffect, useState, useLayoutEffect, useCallback } from 'preact/hooks';
import { motion, AnimatePresence } from 'framer-motion';
import { ErrorBoundary } from './ErrorBoundary';
import { OrganizationNotFound } from './OrganizationNotFound';
import LeftSidebar from './LeftSidebar';
import BusinessOnboardingModal from './onboarding/BusinessOnboardingModal';
import MobileTopNav from './MobileTopNav';
import MediaSidebar from './MediaSidebar';
import PrivacySupportSidebar from './PrivacySupportSidebar';
import OrganizationProfile from './OrganizationProfile';
import { DebugOverlay } from './DebugOverlay';
import { features } from '../config/features';
import { ChatMessageUI, FileAttachment } from '../../worker/types';
import { useNavbarScroll } from '../hooks/useChatScroll';
import { UserIcon } from "@heroicons/react/24/outline";
import { Button } from './ui/Button';
import ActivityTimeline from './ActivityTimeline';
import MatterTab from './MatterTab';
import { useMatterState } from '../hooks/useMatterState';
import { analyzeMissingInfo } from '../utils/matterAnalysis';
import { THEME } from '../utils/constants';
import { debounce } from '../utils/debounce';
import { useToastContext } from '../contexts/ToastContext';
import type { BusinessOnboardingStatus } from '../hooks/useOrganizationManagement';

// Simple messages object for localization
const messages = {
  findLawyer: 'Find Lawyer'
};

interface AppLayoutProps {
  organizationNotFound: boolean;
  organizationId: string;
  onRetryOrganizationConfig: () => void;
  currentTab: 'chats' | 'matter';
  onTabChange: (tab: 'chats' | 'matter') => void;
  isMobileSidebarOpen: boolean;
  onToggleMobileSidebar: (open: boolean) => void;
  isSettingsModalOpen?: boolean;
  organizationConfig: {
    name: string;
    profileImage: string | null;
    description?: string | null;
  };
  currentOrganization?: {
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
  children: React.ReactNode; // ChatContainer component
  onOnboardingCompleted?: () => Promise<void> | void;
}

const AppLayout: FunctionComponent<AppLayoutProps> = ({
  organizationNotFound,
  organizationId,
  onRetryOrganizationConfig,
  currentTab,
  onTabChange,
  isMobileSidebarOpen,
  onToggleMobileSidebar,
  isSettingsModalOpen = false,
  organizationConfig,
  currentOrganization,
  messages: chatMessages,
  onRequestConsultation,
  onSendMessage,
  onUploadDocument,
  children,
  onOnboardingCompleted
}) => {
  // Matter state management
  const { matter, status: matterStatus } = useMatterState(chatMessages);
  // Temp: local state to open the onboarding modal via sidebar test button
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const { showError } = useToastContext();
  
  // Mobile state - initialized as false to avoid SSR/client hydration mismatch
  const [isMobile, setIsMobile] = useState(false);
  
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

  // Mobile detection with resize handling
  useLayoutEffect(() => {
    // Function to check if mobile
    const checkIsMobile = () => {
      return window.innerWidth < 1024;
    };

    // Set initial mobile state
    setIsMobile(checkIsMobile());

    // Create debounced resize handler for performance
    const debouncedResizeHandler = debounce(() => {
      setIsMobile(checkIsMobile());
    }, 100);

    // Add resize listener
    window.addEventListener('resize', debouncedResizeHandler);

    // Cleanup function
    return () => {
      window.removeEventListener('resize', debouncedResizeHandler);
      debouncedResizeHandler.cancel();
    };
  }, []);
  
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
  const { isNavbarVisible } = useNavbarScroll({ 
    threshold: 50, 
    debounceMs: 0
  });

  const handleOpenOnboarding = useCallback(() => {
    if (!currentOrganization?.id) {
      showError('Organization loading', 'Select an organization before starting onboarding.');
      return;
    }
    setIsOnboardingOpen(true);
  }, [currentOrganization?.id, showError]);

  if (organizationNotFound) {
    return <OrganizationNotFound organizationId={organizationId} onRetry={onRetryOrganizationConfig} />;
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

  const onboardingStatus = currentOrganization?.businessOnboardingStatus;
  const hasOnboardingDraft = currentOrganization?.businessOnboardingHasDraft ?? false;
  const onboardingOrganizationId = currentOrganization?.id;

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
              onOpenOnboarding={handleOpenOnboarding}
              matterStatus={matterStatus}
              organizationConfig={{
                name: organizationConfig.name,
                profileImage: organizationConfig.profileImage,
                organizationId
              }}
              currentOrganization={currentOrganization}
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
                    onOpenOnboarding={() => {
                      handleOpenOnboarding();
                      onToggleMobileSidebar(false);
                    }}
                    onClose={() => onToggleMobileSidebar(false)}
                    matterStatus={matterStatus}
                    organizationConfig={{
                      name: organizationConfig.name,
                      profileImage: organizationConfig.profileImage,
                      organizationId
                    }}
                    currentOrganization={currentOrganization}
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
          {currentTab === 'chats' ? children : (
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
          <OrganizationProfile
            name={organizationConfig.name}
            profileImage={organizationConfig.profileImage}
            organizationId={organizationId}
            description={organizationConfig.description}
            variant="sidebar"
            showVerified={true}
            businessOnboardingStatus={onboardingStatus}
            onResumeOnboarding={handleOpenOnboarding}
            businessOnboardingHasDraft={hasOnboardingDraft}
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
          <ActivityTimeline organizationId={organizationId} />

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

      {/* Temporary: Onboarding modal trigger via sidebar test button */}
      {isOnboardingOpen && onboardingOrganizationId && (
        <BusinessOnboardingModal
          isOpen={isOnboardingOpen}
          organizationId={onboardingOrganizationId}
          organizationName={organizationConfig.name || undefined}
          onClose={() => setIsOnboardingOpen(false)}
          onCompleted={onOnboardingCompleted}
        />
      )}
    </div>
  );
};


export default AppLayout; 
