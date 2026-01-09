import { useMemo } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useNavigation } from '@/shared/utils/navigation';
import { Button } from '@/shared/ui/Button';
import { useSubscription } from '@/shared/hooks/useSubscription';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { extractProgressFromPracticeMetadata, ONBOARDING_STEP_SEQUENCE, isValidOnboardingStep } from '@/shared/utils/practiceOnboarding';
import type { OnboardingStep } from '@/features/onboarding/hooks/useStepValidation';
import { NextStepsCard, type NextStepsStatus, type NextStepsItem } from '@/shared/ui/cards/NextStepsCard';

const ClientHomePage = () => {
  const { session } = useSessionContext();
  const { navigate } = useNavigation();
  const { isPracticeEnabled } = useSubscription();
  const { currentPractice } = usePracticeManagement();
  const name = session?.user?.name || session?.user?.email || 'there';
  const showUpgrade = !isPracticeEnabled;
  const onboardingProgress = useMemo(
    () => extractProgressFromPracticeMetadata(currentPractice?.metadata),
    [currentPractice?.metadata]
  );
  const showPracticeOnboarding = isPracticeEnabled && Boolean(currentPractice?.id);

  const practiceChecklistItems = useMemo<NextStepsItem[]>(
    () =>
      CHECKLIST_STEPS.map(({ step, label }) => ({
        id: step,
        title: label,
        status: getChecklistStatus(step, onboardingProgress),
        action: {
          label: 'Open',
          onClick: () => navigate(`/business-onboarding/${step}`),
          variant: 'secondary' as const,
          size: 'sm' as const
        }
      })),
    [navigate, onboardingProgress]
  );

  const clientNextStepsItems = useMemo<NextStepsItem[]>(() => {
    const items: NextStepsItem[] = [
      {
        id: 'client-case',
        title: 'Create your case',
        description: 'Start an intake so you can reuse the details across future chats.',
        status: 'pending'
      }
    ];

    if (showUpgrade) {
      items.push({
        id: 'client-upgrade',
        title: 'Upgrade to legal practice',
        description: 'Accept client intake forms, manage your team, and unlock practice tools.',
        status: 'pending',
        action: {
          label: 'View plans',
          onClick: () => navigate('/pricing'),
          variant: 'secondary' as const,
          size: 'sm' as const
        }
      });
    }

    return items;
  }, [navigate, showUpgrade]);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Welcome, {name}</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Your client workspace is ready. Keep track of your conversations and return to active matters any time.
          </p>
        </div>

        {showPracticeOnboarding ? (
          <NextStepsCard
            title="Your next steps"
            subtitle="Finish onboarding to start receiving client intakes."
            items={practiceChecklistItems}
            action={{ label: 'Continue onboarding', onClick: () => navigate('/business-onboarding') }}
          />
        ) : (
          <>
            <NextStepsCard
              title="Your next steps"
              subtitle="A simple checklist to get you started."
              items={clientNextStepsItems}
            />

            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-card-bg p-6 shadow-sm space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Manage your account</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Update your preferences, notifications, and security settings.
                </p>
              </div>
              <Button variant="secondary" onClick={() => navigate('/settings')}>
                Manage account settings
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const CHECKLIST_STEPS: Array<{ step: OnboardingStep; label: string }> = [
  { step: 'firm-basics', label: 'Add your firm basics' },
  { step: 'business-details', label: 'Add your business info' },
  { step: 'stripe-onboarding', label: 'Connect Stripe' },
  { step: 'services', label: 'Add your services' },
  { step: 'review-and-launch', label: 'Launch your intake assistant' }
];

const resolveResumeStep = (progress: ReturnType<typeof extractProgressFromPracticeMetadata>): OnboardingStep | undefined => {
  if (!progress?.data) return undefined;
  const candidate = progress.data.__meta?.resumeStep;
  return isValidOnboardingStep(candidate) ? candidate : undefined;
};

const getChecklistStatus = (
  targetStep: OnboardingStep,
  progress: ReturnType<typeof extractProgressFromPracticeMetadata>
): NextStepsStatus => {
  const isComplete =
    progress?.status === 'completed' ||
    progress?.completed ||
    progress?.status === 'skipped' ||
    progress?.skipped;

  if (isComplete) {
    return 'completed';
  }

  const resumeStep = resolveResumeStep(progress);
  const targetIndex = ONBOARDING_STEP_SEQUENCE.indexOf(targetStep);
  const resumeIndex = resumeStep ? ONBOARDING_STEP_SEQUENCE.indexOf(resumeStep) : -1;

  if (resumeIndex >= 0 && targetIndex >= 0) {
    if (targetIndex < resumeIndex) return 'completed';
    if (targetIndex === resumeIndex) return 'pending';
    return 'incomplete';
  }

  return targetIndex === ONBOARDING_STEP_SEQUENCE.indexOf('firm-basics')
    ? 'pending'
    : 'incomplete';
};

export default ClientHomePage;
