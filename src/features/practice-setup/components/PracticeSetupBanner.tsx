import { Button } from '@/shared/ui/Button';
import { SettingsNotice } from '@/features/settings/components/SettingsNotice';
import type { PracticeSetupStatus } from '../utils/status';

interface PracticeSetupBannerProps {
  status: PracticeSetupStatus;
  onNavigate: (target: 'basics' | 'contact' | 'services') => void;
}

export const PracticeSetupBanner = ({ status, onNavigate }: PracticeSetupBannerProps) => {
  if (!status.needsSetup) return null;

  const steps = [
    {
      id: 'basics' as const,
      label: 'Firm basics',
      description: 'Confirm your firm name and public profile.',
      complete: status.basicsComplete,
      actionLabel: 'Edit basics'
    },
    {
      id: 'contact' as const,
      label: 'Contact & location',
      description: 'Add a phone, email, or address for client receipts.',
      complete: status.contactComplete,
      actionLabel: 'Add contact info'
    },
    {
      id: 'services' as const,
      label: 'Services & intake',
      description: 'Choose the services you want to intake.',
      complete: status.servicesComplete,
      actionLabel: 'Configure services'
    }
  ];

  return (
    <SettingsNotice variant="warning" className="mb-4 space-y-4">
      <div>
        <p className="text-sm font-semibold">Almost ready to go</p>
        <p className="text-xs text-gray-600 dark:text-gray-300">
          Complete these quick steps to unlock AI chat and client intake.
        </p>
      </div>
      <div className="space-y-3">
        {steps.map((step) => (
          <div key={step.id} className="flex flex-col gap-1 rounded-lg bg-white/60 p-3 dark:bg-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <div className={`h-2 w-2 rounded-full ${step.complete ? 'bg-green-500' : 'bg-gray-300'}`} />
                {step.label}
              </div>
              {!step.complete && (
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => onNavigate(step.id)}
                >
                  {step.actionLabel}
                </Button>
              )}
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300">{step.description}</p>
          </div>
        ))}
      </div>
    </SettingsNotice>
  );
};
