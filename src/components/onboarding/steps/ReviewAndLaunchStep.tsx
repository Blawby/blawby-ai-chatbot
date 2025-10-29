/**
 * Review and Launch Step Component
 */

import { Switch } from '../../ui/input';
import { ReviewField } from '../molecules/ReviewField';
import { IntakeUrlDisplay } from '../molecules/IntakeUrlDisplay';
import { OnboardingActions } from '../molecules/OnboardingActions';
import { InfoCard } from '../atoms/InfoCard';
import { FeatureList } from '../molecules/FeatureList';
import { useTranslation } from '../../../i18n/hooks';

interface ReviewAndLaunchStepProps {
  data: {
    firmName: string;
    contactEmail: string;
    contactPhone?: string;
    website?: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    overview: string;
    services: Array<{ title: string; description: string }>;
    isPublic: boolean;
  };
  organizationSlug: string;
  onVisibilityChange: (isPublic: boolean) => void;
  onComplete: () => void;
  onBack: () => void;
}

export function ReviewAndLaunchStep({ 
  data, 
  organizationSlug,
  onVisibilityChange,
  onComplete, 
  onBack 
}: ReviewAndLaunchStepProps) {
  const { t } = useTranslation('common');
  const intakeUrl = `https://ai.blawby.com/${organizationSlug || 'your-firm'}`;
  const validServices = data.services.filter(service => service.title.trim().length > 0);

  const launchFeatures = [
    {
      text: t('reviewAndLaunch.launchFeatures.assistantAvailable'),
      variant: 'default' as const
    },
    {
      text: t('reviewAndLaunch.launchFeatures.clientsCanChat'),
      variant: 'default' as const
    },
    {
      text: t('reviewAndLaunch.launchFeatures.notifications'),
      variant: 'default' as const
    }
  ];

  return (
    <div className="space-y-6">
      {/* Review Section */}
      <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.05] p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {t('reviewAndLaunch.title')}
        </h3>

        {/* Firm Information */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('reviewAndLaunch.sections.firmInformation')}</h4>
          <div className="space-y-1">
            <ReviewField label={t('reviewAndLaunch.labels.name')} value={data.firmName} />
            <ReviewField label={t('reviewAndLaunch.labels.email')} value={data.contactEmail} />
            {data.contactPhone && <ReviewField label={t('reviewAndLaunch.labels.phone')} value={data.contactPhone} />}
            {data.website && <ReviewField label={t('reviewAndLaunch.labels.website')} value={data.website} />}
          </div>
        </div>

        {/* Address */}
        {(data.addressLine1 || data.city) && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('reviewAndLaunch.sections.address')}</h4>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {data.addressLine1 && <p>{data.addressLine1}</p>}
              {data.addressLine2 && <p>{data.addressLine2}</p>}
              {data.city && (
                <p>
                  {data.city}
                  {data.state && `, ${data.state}`}
                  {data.postalCode && ` ${data.postalCode}`}
                </p>
              )}
              {data.country && <p>{data.country}</p>}
            </div>
          </div>
        )}

        {/* Business Description */}
        {data.overview && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('reviewAndLaunch.sections.description')}</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">{data.overview}</p>
          </div>
        )}

        {/* Services */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('reviewAndLaunch.sections.services')}</h4>
          {validServices.length > 0 ? (
            <ul className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
              {validServices.map((service, i) => (
                <li key={i}>
                  <strong>{i + 1}. {service.title}</strong>
                  {service.description && <span> - {service.description}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">{t('reviewAndLaunch.messages.noServicesConfigured')}</p>
          )}
        </div>
      </div>

      {/* Visibility Toggle */}
      <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-white/10 rounded-lg">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {t('reviewAndLaunch.visibility.title')}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('reviewAndLaunch.visibility.description')}
          </p>
        </div>
        <Switch
          value={data.isPublic}
          onChange={onVisibilityChange}
        />
      </div>

      {/* Intake URL */}
      <IntakeUrlDisplay url={intakeUrl} />

      {/* What happens when you launch */}
      <InfoCard
        variant="default"
        title={t('reviewAndLaunch.launchFeatures.title')}
      >
        <FeatureList items={launchFeatures} size="sm" />
      </InfoCard>

      <OnboardingActions
        onContinue={onComplete}
        onBack={onBack}
        continueLabel={t('reviewAndLaunch.actions.launchAssistant')}
        isLastStep={true}
      />
    </div>
  );
}