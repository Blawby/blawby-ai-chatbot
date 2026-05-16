import { useEffect, useRef, useState } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { getPreferencesCategory, updatePreferencesCategory } from '@/shared/lib/preferencesApi';
import { updateUser, getSession } from '@/shared/lib/authClient';
import type { OnboardingFormData } from '@/shared/types/onboarding';
import { sanitizeOnboardingPersonalInfo } from '@/shared/types/onboarding';
import type { OnboardingPreferences } from '@/shared/types/preferences';
import PersonalInfoStep from './PersonalInfoStep';

// The UseCase step is currently not rendered; we ship a default useCase shape so
// existing backend consumers keep getting the payload they expect. If a real use-case
// picker is reintroduced, replace these defaults with collected input.
const DEFAULT_USE_CASE: OnboardingFormData['useCase'] = {
  primaryUseCase: 'messaging',
  productUsage: ['messaging'],
  additionalInfo: undefined
};

const createDefaultFormData = (fullName = ''): OnboardingFormData => ({
  personalInfo: {
    fullName,
    birthday: '',
    agreedToTerms: false
  },
  useCase: DEFAULT_USE_CASE
});

interface OnboardingFlowProps {
  onClose: () => void;
  onComplete: (data: OnboardingFormData) => void;
  active?: boolean;
  className?: string;
  testId?: string;
}

export const OnboardingFlow = ({
  onClose,
  onComplete,
  active = true,
  className = '',
  testId
}: OnboardingFlowProps) => {
  const { t } = useTranslation('common');
  const { showError, showSuccess } = useToastContext();
  const { session } = useSessionContext();
  const sessionUserSnapshotRef = useRef<{ id?: string; name?: string }>({});
  const sessionUserId = session?.user?.id;
  if (sessionUserId && sessionUserSnapshotRef.current.id !== sessionUserId) {
    sessionUserSnapshotRef.current = {
      id: sessionUserId,
      name: session?.user?.name ?? ''
    };
  }
  const sessionUserName = sessionUserSnapshotRef.current.name ?? '';
  const requiresNameCollection = sessionUserName.trim().length === 0;
  const [onboardingData, setOnboardingData] = useState<OnboardingFormData>(() => createDefaultFormData(sessionUserName));
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (active && sessionUserId && !hasLoadedRef.current) {
      const loadPreferences = async () => {
        try {
          const prefs = await getPreferencesCategory<OnboardingPreferences>('onboarding');
          setOnboardingData((prev) => ({
            personalInfo: {
              ...prev.personalInfo,
              fullName: sessionUserName || prev.personalInfo.fullName,
              birthday: prefs?.birthday ?? '',
              agreedToTerms: prev.personalInfo.agreedToTerms
            },
            useCase: prev.useCase
          }));
        } catch (error) {
          console.error('Failed to load onboarding preferences:', error);
        } finally {
          hasLoadedRef.current = true;
        }
      };

      void loadPreferences();
    } else if (!active) {
      hasLoadedRef.current = false;
    }
  }, [active, sessionUserId, sessionUserName]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleStepComplete = async (data: Partial<OnboardingFormData>) => {
    const mergedData = {
      ...onboardingData,
      ...data
    };

    setOnboardingData(mergedData);
    await handleComplete(mergedData);
  };

  const handleComplete = async (data?: OnboardingFormData) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const sourceData = data || onboardingData;

    try {
      if (import.meta.env.DEV) {
        console.debug('[ONBOARDING][SAVE] updating onboarding data', {
          personalInfo: sanitizeOnboardingPersonalInfo(sourceData.personalInfo),
          useCase: sourceData.useCase
        });
      }

      // Save preferences first. If this fails (e.g. backend hasn't initialized
      // the row yet), the catch block surfaces an error and keeps the user here.
      // Only on success do we mark onboardingComplete, which updates the session
      // and triggers the redirect away from onboarding.
      await updatePreferencesCategory('onboarding', {
        birthday: sourceData.personalInfo.birthday,
        primary_use_case: sourceData.useCase.primaryUseCase,
        use_case_additional_info: sourceData.useCase.additionalInfo,
        product_usage: sourceData.useCase.productUsage,
        completed: true
      });

      const trimmedName = sourceData.personalInfo.fullName?.trim() ?? '';
      const updatePayload: Record<string, unknown> = {
        onboardingComplete: true
      };
      if (trimmedName) {
        updatePayload.name = trimmedName;
      }
      if (sourceData.personalInfo.birthday) {
        updatePayload.dob = sourceData.personalInfo.birthday;
      }

      await updateUser(updatePayload);

      await getSession().catch(() => undefined);

      showSuccess(
        t('onboarding.completed.title', 'Onboarding complete'),
        t('onboarding.completed.message', 'Welcome to Blawby.')
      );

      setOnboardingData(createDefaultFormData(sessionUserName));
      onComplete(sourceData);
      onClose();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[ONBOARDING][SAVE] failed to save onboarding data', error);
      }

      showError(
        t('onboarding.error.title', "Couldn't save"),
        t('onboarding.error.message', "Couldn't save your onboarding. Try again.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const resolvedTestId = testId ?? 'onboarding-flow';

  return (
    <div
      className={`h-full bg-transparent flex flex-col ${className}`}
      data-testid={resolvedTestId}
    >
      <PersonalInfoStep
        data={onboardingData.personalInfo}
        isSubmitting={isSubmitting}
        requireName={requiresNameCollection}
        onComplete={async (data) => await handleStepComplete({ personalInfo: data })}
      />
    </div>
  );
};

export default OnboardingFlow;
