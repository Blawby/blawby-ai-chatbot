import { useEffect, useRef, useState } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { getPreferencesCategory, updatePreferencesCategory } from '@/shared/lib/preferencesApi';
import { updateUser, getSession } from '@/shared/lib/authClient';
import type { OnboardingFormData } from '@/shared/types/onboarding';
import { sanitizeOnboardingPersonalInfo } from '@/shared/types/onboarding';
import type { OnboardingPreferences, ProductUsage } from '@/shared/types/preferences';
import PersonalInfoStep from './PersonalInfoStep';
const createDefaultFormData = (fullName = ''): OnboardingFormData => ({
  personalInfo: {
    fullName,
    birthday: '',
    agreedToTerms: false
  },
  useCase: {
    primaryUseCase: 'messaging',
    productUsage: ['messaging'],
    additionalInfo: undefined
  }
});

const resolvePrimaryUseCase = (
  value: string | undefined
): OnboardingFormData['useCase']['primaryUseCase'] => {
  switch (value) {
    case 'messaging':
    case 'legal_payments':
    case 'matter_management':
    case 'intake_forms':
    case 'other':
      return value;
    case 'personal':
      return 'messaging';
    case 'business':
      return 'legal_payments';
    case 'research':
      return 'matter_management';
    case 'documents':
      return 'intake_forms';
    default:
      return 'other';
  }
};

const normalizeProductUsage = (values: unknown): ProductUsage[] => {
  if (!Array.isArray(values)) return [];
  const mapped = values
    .map((value) => {
      switch (value) {
        case 'messaging':
        case 'legal_payments':
        case 'matter_management':
        case 'intake_forms':
        case 'other':
          return value;
        case 'communication':
          return 'messaging';
        case 'billing':
          return 'legal_payments';
        case 'case_management':
          return 'matter_management';
        case 'document_management':
        case 'client_management':
          return 'intake_forms';
        default:
          return null;
      }
    })
    .filter((value): value is ProductUsage => value !== null);
  return Array.from(new Set(mapped));
};

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
            useCase: {
              primaryUseCase: prefs?.primary_use_case
                ? resolvePrimaryUseCase(prefs.primary_use_case)
                : prev.useCase.primaryUseCase,
              productUsage: (() => {
                const fromPrefs = normalizeProductUsage(prefs?.product_usage);
                if (fromPrefs.length > 0) return fromPrefs;
                if (prefs?.primary_use_case) {
                  return [resolvePrimaryUseCase(prefs.primary_use_case)];
                }
                return prev.useCase.productUsage;
              })(),
              additionalInfo: prefs?.use_case_additional_info ?? prev.useCase.additionalInfo
            }
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

      await updatePreferencesCategory('onboarding', {
        birthday: sourceData.personalInfo.birthday,
        primary_use_case: sourceData.useCase.primaryUseCase,
        use_case_additional_info: sourceData.useCase.additionalInfo,
        product_usage: sourceData.useCase.productUsage,
        completed: true
      });

      await getSession().catch(() => undefined);

      showSuccess(
        t('onboarding.completed.title', 'Onboarding complete!'),
        t('onboarding.completed.message', 'Welcome to Blawby AI.')
      );

      setOnboardingData(createDefaultFormData(sessionUserName));
      onComplete(sourceData);
      onClose();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[ONBOARDING][SAVE] failed to save onboarding data', error);
      }

      showError(
        t('onboarding.error.title', 'Save failed'),
        t('onboarding.error.message', 'Unable to save your onboarding data. Please try again.')
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
