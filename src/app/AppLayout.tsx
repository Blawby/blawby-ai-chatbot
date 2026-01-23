import { FunctionComponent } from 'preact';
import type { ComponentChildren } from 'preact';
import { useMemo } from 'preact/hooks';
import { motion, AnimatePresence } from 'framer-motion';
import { ErrorBoundary } from './ErrorBoundary';
import { PracticeNotFound } from '@/features/practice/components/PracticeNotFound';
import LeftSidebar from '@/shared/components/LeftSidebar';
import type { SidebarNavItem } from '@/shared/ui/sidebar/organisms/SidebarContent';
import MobileTopNav from '@/shared/components/MobileTopNav';
import MediaSidebar from '@/features/media/components/MediaSidebar';
import PracticeProfile from '@/features/practice/components/PracticeProfile';
import { DebugOverlay } from '@/shared/components/DebugOverlay';
import { features } from '@/config/features';
import { ChatMessageUI } from '../../worker/types';
import { useNavbarScroll } from '@/shared/hooks/useChatScroll';
import { UserIcon } from '@heroicons/react/24/outline';
import { Button } from '@/shared/ui/Button';
import ActivityTimeline from '@/features/matters/components/ActivityTimeline';
import { THEME } from '@/shared/utils/constants';
import { useNavigation } from '@/shared/utils/navigation';
import type { BusinessOnboardingStatus } from '@/shared/hooks/usePracticeManagement';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import type { WorkspaceType } from '@/shared/types/workspace';
import type { SubscriptionTier } from '@/shared/types/user';
import type { PracticeDetails } from '@/shared/lib/apiClient';
import AnnouncementBanner from '@/shared/components/AnnouncementBanner';

// Simple messages object for localization
const messages = {
  requestConsultation: 'Request Consultation'
};

interface AppLayoutProps {
  workspace: WorkspaceType;
  practiceNotFound: boolean;
  practiceId: string;
  onRetryPracticeConfig: () => void;
  navItems?: SidebarNavItem[];
  isMobileSidebarOpen: boolean;
  onToggleMobileSidebar: (open: boolean) => void;
  isSettingsModalOpen?: boolean;
  practiceConfig: {
    name: string;
    profileImage: string | null;
    description?: string | null;
    slug?: string | null;
  };
  currentPractice?: {
    id: string;
    slug?: string | null;
    subscriptionTier?: SubscriptionTier;
    businessOnboardingStatus?: BusinessOnboardingStatus;
    businessOnboardingCompletedAt?: number | null;
    businessOnboardingHasDraft?: boolean;
    name?: string | null;
    businessEmail?: string | null;
    businessPhone?: string | null;
    website?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
    introMessage?: string | null;
    description?: string | null;
    services?: Array<Record<string, unknown>> | null;
    isPublic?: boolean | null;
  } | null;
  practiceDetails?: PracticeDetails | null;
  messages?: ChatMessageUI[];
  onRequestConsultation?: () => void | Promise<void>;
  conversationSidebarContent?: ComponentChildren;
  showRightSidebar?: boolean;
  children: ComponentChildren;
}

const AppLayout: FunctionComponent<AppLayoutProps> = ({
  workspace,
  practiceNotFound,
  practiceId,
  onRetryPracticeConfig,
  navItems,
  isMobileSidebarOpen,
  onToggleMobileSidebar,
  isSettingsModalOpen = false,
  practiceConfig,
  currentPractice,
  messages: chatMessages = [],
  onRequestConsultation,
  conversationSidebarContent,
  showRightSidebar = false,
  children,
  practiceDetails
}) => {
  const { navigate } = useNavigation();
  const { isNavbarVisible } = useNavbarScroll({
    threshold: 50,
    debounceMs: 0
  });
  const isMobile = useMobileDetection();
  const practiceSlug = currentPractice?.slug ?? practiceConfig.slug ?? practiceId;
  const practiceDescription = practiceDetails?.description ?? currentPractice?.description ?? practiceConfig.description ?? null;

  const practiceBanner = useMemo(() => {
    if (workspace !== 'practice') return null;
    if (!currentPractice?.id) return null;

    const stripeStatus = currentPractice.businessOnboardingStatus;
    const stripeReady = stripeStatus === 'completed' || stripeStatus === 'not_required';
    if (stripeReady) return null;

    return {
      title: 'Blawby payouts are almost ready to go.',
      description: 'You just need to provide a few details to start sending invoices and getting paid.',
      actions: [
        {
          label: 'Set up payouts',
          onClick: () => navigate('/settings/account/payouts'),
          variant: 'primary' as const
        }
      ]
    };
  }, [currentPractice, navigate, workspace]);

  const shouldShowSidebar = features.enableLeftSidebar && workspace !== 'public' && !(isMobile && isSettingsModalOpen);

  if (practiceNotFound) {
    return <PracticeNotFound practiceId={practiceId} onRetry={onRetryPracticeConfig} />;
  }

  return (
    <div className="max-md:h-[100dvh] md:h-screen w-full flex bg-white dark:bg-dark-bg">
      {/* Left Sidebar - Desktop: always visible, Mobile: slide-out, Hidden when settings modal is open on mobile */}
      {shouldShowSidebar && (
        <>
          {/* Desktop Sidebar */}
          <div className="overflow-y-auto hidden lg:block">
            <LeftSidebar
              navItems={navItems ?? []}
              conversationContent={conversationSidebarContent}
              practiceConfig={{
                name: practiceConfig.name,
                profileImage: practiceConfig.profileImage,
                practiceId
              }}
              currentPractice={currentPractice}
            />
          </div>

          {/* Mobile Sidebar - Conditionally rendered for accessibility */}
          <AnimatePresence>
            {isMobileSidebarOpen && (
              <motion.div
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
                    type: 'spring',
                    stiffness: 300,
                    damping: 30
                  }}
                >
                  <LeftSidebar
                    navItems={navItems ?? []}
                    conversationContent={conversationSidebarContent}
                    onClose={() => onToggleMobileSidebar(false)}
                    practiceConfig={{
                      name: practiceConfig.name,
                      profileImage: practiceConfig.profileImage,
                      practiceId
                    }}
                    currentPractice={currentPractice}
                  />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Main Content Area - Flex grow, full width on mobile */}
      <div className="flex-1 bg-white dark:bg-dark-bg flex flex-col min-h-0">
        {practiceBanner && (
          <div className="px-4 pt-4">
            <AnnouncementBanner
              title={practiceBanner.title}
              description={practiceBanner.description}
              actions={practiceBanner.actions}
              tone="warning"
            />
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
      </div>

      {/* Right Sidebar - Fixed width, hidden on mobile */}
      {showRightSidebar && (
        <div className="w-80 overflow-y-auto scrollbar-hide hidden lg:block p-2">
          <div className="bg-light-card-bg dark:bg-dark-card-bg rounded-lg p-6 text-gray-900 dark:text-white flex flex-col gap-6 h-full">
            <PracticeProfile
              name={practiceConfig.name}
              profileImage={practiceConfig.profileImage}
              practiceSlug={practiceSlug}
              description={practiceDescription}
              showVerified={true}
            />

            {/* Request Consultation Button - Primary Action */}
            {onRequestConsultation && (
              <div className="flex flex-col gap-3 pt-2">
                <Button
                  onClick={onRequestConsultation}
                  variant="primary"
                  type="button"
                  icon={<UserIcon className="w-4 h-4" />}
                >
                  {messages.requestConsultation}
                </Button>
              </div>
            )}

            {/* Activity Timeline Section */}
            {features.enableActivity && <ActivityTimeline practiceId={practiceId} />}

            {/* Media Section */}
            <MediaSidebar messages={chatMessages} />
          </div>
        </div>
      )}

      {features.enableLeftSidebar && workspace !== 'public' && (
        <MobileTopNav
          onOpenSidebar={() => onToggleMobileSidebar(true)}
          onPlusClick={() => {
            window.location.hash = '#pricing';
          }}
          isVisible={isNavbarVisible}
        />
      )}

      {/* Debug Overlay - Only when explicitly enabled */}
      {import.meta.env.VITE_DEBUG_OVERLAY === 'true' && (
        <DebugOverlay isVisible={true} />
      )}
    </div>
  );
};

export default AppLayout;
