/**
 * Business Details Step Component
 */

import { Input, Textarea } from '../../ui/input';
import { OnboardingActions } from '../molecules/OnboardingActions';
import { useTranslation } from '../../../i18n/hooks';

interface BusinessDetailsData {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  overview: string;
}

interface BusinessDetailsStepProps {
  data: BusinessDetailsData;
  onChange: (data: BusinessDetailsData) => void;
  onContinue: () => void;
  onBack: () => void;
  errors?: string | null;
}

export function BusinessDetailsStep({ data, onChange, onContinue, onBack, errors }: BusinessDetailsStepProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      {/* Address fields - Row 1: Address Line 1 & 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label={t('onboarding:businessDetails.addressLine1Label')}
          value={data.addressLine1 || ''}
          onChange={(value) => onChange({ ...data, addressLine1: value })}
          placeholder={t('onboarding:businessDetails.addressLine1Placeholder')}
        />
        <Input
          label={t('onboarding:businessDetails.addressLine2Label')}
          value={data.addressLine2 || ''}
          onChange={(value) => onChange({ ...data, addressLine2: value })}
          placeholder={t('onboarding:businessDetails.addressLine2Placeholder')}
        />
      </div>

      {/* Address fields - Row 2: City, State, Postal Code */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          label={t('onboarding:businessDetails.cityLabel')}
          value={data.city || ''}
          onChange={(value) => onChange({ ...data, city: value })}
          placeholder={t('onboarding:businessDetails.cityPlaceholder')}
        />
        <Input
          label={t('onboarding:businessDetails.stateLabel')}
          value={data.state || ''}
          onChange={(value) => onChange({ ...data, state: value })}
          placeholder={t('onboarding:businessDetails.statePlaceholder')}
        />
        <Input
          label={t('onboarding:businessDetails.postalCodeLabel')}
          value={data.postalCode || ''}
          onChange={(value) => onChange({ ...data, postalCode: value })}
          placeholder={t('onboarding:businessDetails.postalCodePlaceholder')}
        />
      </div>

      {/* Address fields - Row 3: Country */}
      <Input
        label={t('onboarding:businessDetails.countryLabel')}
        value={data.country || ''}
        onChange={(value) => onChange({ ...data, country: value })}
        placeholder={t('onboarding:businessDetails.countryPlaceholder')}
      />

      {/* Business Description */}
      <Textarea
        label={t('onboarding:businessDetails.businessDescriptionLabel')}
        value={data.overview}
        onChange={(value) => onChange({ ...data, overview: value })}
        rows={5}
        placeholder={t('onboarding:businessDetails.businessDescriptionPlaceholder')}
      />

      <OnboardingActions
        onContinue={onContinue}
        onBack={onBack}
        backLabel={t('onboarding:businessDetails.backButton')}
        continueLabel={t('onboarding:businessDetails.nextButton')}
      />
    </div>
  );
}