// Main onboarding components
export { default as BusinessOnboardingModal } from './BusinessOnboardingModal';

// Re-export status badge from badges
export { OnboardingStatusBadge, type OnboardingStatus, type OnboardingStatusVariant } from '../ui/badges/OnboardingStatusBadge';

// Export organisms for advanced usage
export { OnboardingContainer } from './organisms/OnboardingContainer';
export { OnboardingStepRenderer } from './organisms/OnboardingStepRenderer';
export { BusinessSetupPrompt } from './organisms/BusinessSetupPrompt';
export { BusinessWelcomePrompt } from './organisms/BusinessWelcomePrompt';

// Export molecules for custom implementations
export { OnboardingHeader } from './molecules/OnboardingHeader';
export { OnboardingActions } from './molecules/OnboardingActions';
export { FeatureList, type FeatureItem } from './molecules/FeatureList';
export { StepProgress } from './molecules/StepProgress';
export { ReviewField } from './molecules/ReviewField';
export { IntakeUrlDisplay } from './molecules/IntakeUrlDisplay';

// Export atoms for custom implementations
export { StepIndicator, type StepIndicatorVariant, type StepIndicatorSize } from './atoms/StepIndicator';
export { FeatureBullet, type FeatureBulletVariant, type FeatureBulletSize } from './atoms/FeatureBullet';
export { ValidationAlert, type ValidationAlertType } from './atoms/ValidationAlert';
export { ChecklistItem, type ChecklistItemStatus, type ChecklistItemSize } from './atoms/ChecklistItem';
export { InfoCard, type InfoCardVariant, type InfoCardSize } from './atoms/InfoCard';

// Export hooks for custom implementations
export { useOnboardingState, type OnboardingFormData } from './hooks/useOnboardingState';
export { useStepValidation, type OnboardingStep, type ValidationError } from './hooks/useStepValidation';
export { useStepNavigation } from './hooks/useStepNavigation';

// Export step components
export { WelcomeStep } from './steps/WelcomeStep';
export { FirmBasicsStep } from './steps/FirmBasicsStep';
export { TrustAccountIntroStep } from './steps/TrustAccountIntroStep';
export { StripeOnboardingStep } from './steps/StripeOnboardingStep';
export { BusinessDetailsStep } from './steps/BusinessDetailsStep';
export { ServicesStep } from './steps/ServicesStep';
export { ReviewAndLaunchStep } from './steps/ReviewAndLaunchStep';
