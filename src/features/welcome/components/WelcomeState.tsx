import { useMemo } from 'preact/hooks';
import { ChecklistItem, type ChecklistItemStatus } from '@/features/onboarding/components/ChecklistItem';
import { InfoCard } from '@/features/onboarding/components/InfoCard';
import type { Practice } from '@/shared/hooks/usePracticeManagement';
import { useNavigation } from '@/shared/utils/navigation';
import {
  ONBOARDING_STEP_SEQUENCE,
  extractProgressFromPracticeMetadata,
  isValidOnboardingStep,
  type PracticeOnboardingProgress
} from '@/shared/utils/practiceOnboarding';
import { Button } from '@/shared/ui/Button';
import { useTranslation } from '@/shared/i18n/hooks';
import type { OnboardingStep } from '@/features/onboarding/hooks/useStepValidation';

type OnboardingProgress = PracticeOnboardingProgress<Record<string, unknown>> | null | undefined;

interface WelcomeStateProps {
  currentPractice?: Practice | null;
  onStartOnboarding: () => void;
  onboardingProgress?: OnboardingProgress;
}

const CHECKLIST_STEPS: Array<{ step: OnboardingStep; labelKey: string }> = [
  { step: 'firm-basics', labelKey: 'welcome.lawyer.todo.createPractice' },
  { step: 'business-details', labelKey: 'welcome.lawyer.todo.businessDetails' },
  { step: 'stripe-onboarding', labelKey: 'welcome.lawyer.todo.trustAccount' },
  { step: 'services', labelKey: 'welcome.lawyer.todo.services' },
  { step: 'review-and-launch', labelKey: 'welcome.lawyer.todo.launch' }
];

const resolveResumeStep = (progress: OnboardingProgress): OnboardingStep | undefined => {
  if (!progress?.data) return undefined;
  const candidate = progress.data.__meta?.resumeStep;
  return isValidOnboardingStep(candidate) ? candidate : undefined;
};

const getChecklistStatus = (
  targetStep: OnboardingStep,
  progress: OnboardingProgress
): ChecklistItemStatus => {
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

const WelcomeState = ({
  currentPractice,
  onStartOnboarding,
  onboardingProgress
}: WelcomeStateProps) => {
  const { t } = useTranslation('common');
  const { navigate } = useNavigation();

  const progress =
    onboardingProgress || extractProgressFromPracticeMetadata(currentPractice?.metadata);

  const checklistItems = useMemo(
    () =>
      CHECKLIST_STEPS.map(({ step, labelKey }) => ({
        label: t(labelKey),
        status: getChecklistStatus(step, progress)
      })),
    [progress, t]
  );

  const handleGetStarted = () => {
    onStartOnboarding();
  };

  const handleLearnMore = () => {
    navigate('/business-onboarding');
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <InfoCard
          title={t('welcome.lawyer.title')}
          variant="amber"
          className="mb-4"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="text-base text-gray-700 dark:text-gray-200">
                {t('welcome.lawyer.subtitle')}
              </p>
              {currentPractice?.slug && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {currentPractice.slug}
                </p>
              )}
            </div>
            <Button onClick={handleGetStarted} className="w-full md:w-auto">
              {t('welcome.lawyer.getStarted')}
            </Button>
          </div>
        </InfoCard>

        <div className="rounded-lg border border-gray-200 bg-light-card-bg p-6 shadow-sm dark:border-dark-border dark:bg-dark-card-bg">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {t('welcome.lawyer.todo.createPractice')}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('welcome.lawyer.subtitle')}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={handleLearnMore}
              className="w-full sm:w-auto"
            >
              {t('welcome.lawyer.getStarted')}
            </Button>
          </div>

          <div className="mt-6 space-y-4" aria-label="onboarding checklist">
            {checklistItems.map((item) => (
              <ChecklistItem
                key={item.label}
                status={item.status}
                className="text-base"
              >
                {item.label}
              </ChecklistItem>
            ))}
          </div>

          <div className="mt-6">
            <Button onClick={handleGetStarted} className="w-full sm:w-auto">
              {t('welcome.lawyer.getStarted')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeState;
