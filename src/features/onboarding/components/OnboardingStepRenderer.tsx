/**
 * OnboardingStepRenderer - Organism Component
 * 
 * Maps step type to step component and handles step transitions.
 * Orchestrates step rendering and data flow.
 */

import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { OnboardingActions } from './OnboardingActions';
import { WelcomeStep } from '../steps/WelcomeStep';
import { FirmBasicsStep } from '../steps/FirmBasicsStep';
import { TrustAccountIntroStep } from '../steps/TrustAccountIntroStep';
import { StripeOnboardingStep } from '../steps/StripeOnboardingStep';
import { BusinessDetailsStep } from '../steps/BusinessDetailsStep';
import { ServicesStep } from '../steps/ServicesStep';
import { ReviewAndLaunchStep } from '../steps/ReviewAndLaunchStep';
import { useTranslation } from '@/shared/i18n/hooks';
import type { OnboardingStep, OnboardingFormData } from '../hooks';
import type { StripeConnectStatus } from '../types';
import type { ComponentChildren } from 'preact';
import type { OnboardingActionsProps } from './OnboardingActions';

interface OnboardingStepRendererProps {
  currentStep: OnboardingStep;
  stepData: OnboardingFormData;
  onChange: (field: keyof OnboardingFormData, value: unknown) => void;
  onContinue: () => void;
  onBack: () => void;
  onSkip?: () => void;
  practiceSlug?: string;
  disabled?: boolean;
  stripeStatus?: StripeConnectStatus | null;
  stripeLoading?: boolean;
  onFooterChange?: (footer: ComponentChildren | null) => void;
  actionLoading?: boolean;
  isFirstStep?: boolean;
  isLastStep?: boolean;
}

export const OnboardingStepRenderer = ({
  currentStep,
  stepData,
  onChange,
  onContinue,
  onBack,
  onSkip,
  practiceSlug,
  disabled = false,
  stripeStatus,
  stripeLoading = false,
  onFooterChange,
  actionLoading = false,
  isFirstStep = false,
  isLastStep = false,
}: OnboardingStepRendererProps) => {
  const { t } = useTranslation();
  const [stepActionLoading, setStepActionLoading] = useState(false);

  useEffect(() => {
    setStepActionLoading(false);
  }, [currentStep]);

  const combinedLoading = actionLoading || stepActionLoading;

  const handleActionLoadingChange = useCallback((loading: boolean) => {
    setStepActionLoading(loading);
  }, []);

  const footerProps: OnboardingActionsProps = useMemo(() => {
    const base: OnboardingActionsProps = {
      onContinue,
      onBack,
      onSkip,
      loading: combinedLoading,
      isFirstStep,
      isLastStep
    };

    switch (currentStep) {
      case 'welcome':
        return {
          ...base,
          continueLabel: t('onboarding:welcome.getStarted'),
          isFirstStep: true
        };
      case 'firm-basics':
      case 'trust-account-intro':
      case 'stripe-onboarding':
        return base;
      case 'business-details':
        return {
          ...base,
          backLabel: t('onboarding:businessDetails.backButton'),
          continueLabel: t('onboarding:businessDetails.nextButton')
        };
      case 'services':
        return {
          ...base,
          onSkip: undefined
        };
      case 'review-and-launch':
        return {
          ...base,
          continueLabel: t('onboarding:reviewAndLaunch.actions.launchAssistant'),
          isLastStep: true
        };
      default:
        return base;
    }
  }, [
    combinedLoading,
    currentStep,
    isFirstStep,
    isLastStep,
    onBack,
    onContinue,
    onSkip,
    t
  ]);

  const footer = useMemo(() => <OnboardingActions {...footerProps} />, [footerProps]);

  useEffect(() => {
    onFooterChange?.(footer);
  }, [footer, onFooterChange]);

  switch (currentStep) {
    case 'welcome':
      return <WelcomeStep />;

    case 'firm-basics':
      return (
        <FirmBasicsStep
          disabled={disabled}
          data={{
            firmName: stepData.firmName,
            contactEmail: stepData.contactEmail,
            slug: stepData.slug
          }}
          onChange={(data) => {
            onChange('firmName', data.firmName);
            onChange('contactEmail', data.contactEmail);
            onChange('slug', data.slug);
          }}
        />
      );

    case 'trust-account-intro':
      return <TrustAccountIntroStep />;

    case 'stripe-onboarding':
      return (
        <StripeOnboardingStep
          status={stripeStatus}
          loading={stripeLoading}
          onActionLoadingChange={handleActionLoadingChange}
        />
      );

    case 'business-details':
      return (
        <BusinessDetailsStep
          disabled={disabled}
          data={{
            website: stepData.website,
            contactPhone: stepData.contactPhone,
            consultationFee: stepData.consultationFee,
            addressLine1: stepData.addressLine1,
            addressLine2: stepData.addressLine2,
            city: stepData.city,
            state: stepData.state,
            postalCode: stepData.postalCode,
            country: stepData.country,
            description: stepData.description,
            introMessage: stepData.introMessage
          }}
          onChange={(data) => {
            onChange('website', data.website);
            onChange('contactPhone', data.contactPhone);
            onChange('consultationFee', data.consultationFee);
            onChange('addressLine1', data.addressLine1);
            onChange('addressLine2', data.addressLine2);
            onChange('city', data.city);
            onChange('state', data.state);
            onChange('postalCode', data.postalCode);
            onChange('country', data.country);
            onChange('description', data.description);
            onChange('introMessage', data.introMessage ?? '');
          }}
        />
      );

    case 'services': {
      return (
        <ServicesStep
          data={stepData.services}
          onChange={(services) => onChange('services', services)}
        />
      );
    }

    case 'review-and-launch':
      return (
        <ReviewAndLaunchStep
          data={stepData}
          practiceSlug={practiceSlug}
          onVisibilityChange={(isPublic) => onChange('isPublic', isPublic)}
        />
      );

    default:
      return null;
  }
};
