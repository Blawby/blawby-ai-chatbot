/**
 * OnboardingStepRenderer - Organism Component
 * 
 * Maps step type to step component and handles step transitions.
 * Orchestrates step rendering and data flow.
 */

import { WelcomeStep } from '../steps/WelcomeStep';
import { FirmBasicsStep } from '../steps/FirmBasicsStep';
import { TrustAccountIntroStep } from '../steps/TrustAccountIntroStep';
import { StripeOnboardingStep } from '../steps/StripeOnboardingStep';
import { BusinessDetailsStep } from '../steps/BusinessDetailsStep';
import { ServicesStep } from '../steps/ServicesStep';
import { ReviewAndLaunchStep } from '../steps/ReviewAndLaunchStep';
import type { OnboardingStep, OnboardingFormData } from '../hooks';
import type { StripeConnectStatus } from '../types';

interface OnboardingStepRendererProps {
  currentStep: OnboardingStep;
  stepData: OnboardingFormData;
  onChange: (field: keyof OnboardingFormData, value: unknown) => void;
  onContinue: () => void;
  onBack: () => void;
  onSkip?: () => void;
  errors?: string | null;
  practiceSlug?: string;
  disabled?: boolean;
  stripeStatus?: StripeConnectStatus | null;
  stripeClientSecret?: string | null;
  stripeLoading?: boolean;
}

export const OnboardingStepRenderer = ({
  currentStep,
  stepData,
  onChange,
  onContinue,
  onBack,
  onSkip,
  errors,
  practiceSlug,
  disabled = false,
  stripeStatus,
  stripeClientSecret,
  stripeLoading = false,
}: OnboardingStepRendererProps) => {
  const commonProps = {
    onContinue,
    onBack,
    onSkip
  };

  switch (currentStep) {
    case 'welcome':
      return <WelcomeStep {...commonProps} />;

    case 'firm-basics':
      return (
        <FirmBasicsStep
          {...commonProps}
          disabled={disabled}
          data={{
            firmName: stepData.firmName,
            contactEmail: stepData.contactEmail,
            contactPhone: stepData.contactPhone,
            website: stepData.website
          }}
          onChange={(data) => {
            onChange('firmName', data.firmName);
            onChange('contactEmail', data.contactEmail);
            onChange('contactPhone', data.contactPhone);
            onChange('website', data.website);
          }}
          errors={errors}
          onSkip={onSkip}
        />
      );

    case 'trust-account-intro':
      return <TrustAccountIntroStep {...commonProps} />;

    case 'stripe-onboarding':
      return (
        <StripeOnboardingStep
          {...commonProps}
          status={stripeStatus}
          loading={stripeLoading}
          clientSecret={stripeClientSecret}
        />
      );

    case 'business-details':
      return (
        <BusinessDetailsStep
          {...commonProps}
          disabled={disabled}
          data={{
            addressLine1: stepData.addressLine1,
            addressLine2: stepData.addressLine2,
            city: stepData.city,
            state: stepData.state,
            postalCode: stepData.postalCode,
            country: stepData.country,
            overview: stepData.overview
          }}
          onChange={(data) => {
            onChange('addressLine1', data.addressLine1);
            onChange('addressLine2', data.addressLine2);
            onChange('city', data.city);
            onChange('state', data.state);
            onChange('postalCode', data.postalCode);
            onChange('country', data.country);
            onChange('overview', data.overview);
          }}
          errors={errors}
        />
      );

    case 'services': {
      return (
        <ServicesStep
          {...commonProps}
          data={stepData.services}
          onChange={(services) => onChange('services', services)}
          errors={errors}
        />
      );
    }

    case 'review-and-launch':
      return (
        <ReviewAndLaunchStep
          {...commonProps}
          onSkip={onSkip}
          data={stepData}
          practiceSlug={practiceSlug}
          onVisibilityChange={(isPublic) => onChange('isPublic', isPublic)}
          onComplete={onContinue}
        />
      );

    default:
      return null;
  }
};
