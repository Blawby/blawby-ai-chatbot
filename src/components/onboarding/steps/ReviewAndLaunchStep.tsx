/**
 * Review and Launch Step Component
 */

import { useTranslation } from '@/i18n/hooks';
import { Button } from '../../ui/Button';
import { Switch } from '../../ui/input';

interface ReviewAndLaunchStepProps {
  data: {
    firmName: string;
    contactEmail: string;
    contactPhone: string;
    website: string;
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
  const { t } = useTranslation('onboarding');
  
  const intakeUrl = `https://ai.blawby.com/${organizationSlug || 'your-firm'}`;
  const validServices = data.services.filter(service => service.title.trim().length > 0);

  return (
    <div className="space-y-6">
      {/* Review Section */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Review your business profile
        </h3>

        {/* Firm Information */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Firm Information</h4>
          <div className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
            <p><strong>Name:</strong> {data.firmName}</p>
            <p><strong>Email:</strong> {data.contactEmail}</p>
            <p><strong>Phone:</strong> {data.contactPhone}</p>
            {data.website && <p><strong>Website:</strong> {data.website}</p>}
          </div>
        </div>

        {/* Address */}
        {(data.addressLine1 || data.city) && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Address</h4>
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
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Description</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">{data.overview}</p>
          </div>
        )}

        {/* Services */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Services</h4>
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
            <p className="text-sm text-gray-500">No services configured</p>
          )}
        </div>
      </div>

      {/* Visibility Toggle */}
      <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            Make workspace public
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Anyone can chat with your assistant
          </p>
        </div>
        <Switch
          value={data.isPublic}
          onChange={onVisibilityChange}
        />
      </div>

      {/* Intake URL */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 p-4">
        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
          Your intake form will be available at:
        </p>
        <p className="text-sm text-blue-700 dark:text-blue-300 font-mono mt-1">
          {intakeUrl}
        </p>
      </div>

      <div className="flex gap-3 pt-4">
        <Button variant="secondary" onClick={onBack} className="flex-1">
          Back
        </Button>
        <Button variant="primary" onClick={onComplete} className="flex-1">
          Launch →
        </Button>
      </div>
    </div>
  );
}