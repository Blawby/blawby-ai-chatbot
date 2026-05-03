/**
 * OnboardingActions - Handles onboarding action buttons and progress
 *
 * Extracts action logic from PracticeSetup to provide cleaner separation
 * between chat interface and action buttons.
 */

import { FunctionComponent } from 'preact';
import { Button } from '@/shared/ui/Button';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { ProgressRing } from '@/shared/ui/ProgressRing';
import type { PracticeSetupStatus } from '../../practice-setup/utils/status';

export interface OnboardingActionsProps {
  status: PracticeSetupStatus;
  onSaveBasics?: (values: {
    name: string;
    slug: string;
    accentColor: string;
  }) => Promise<void>;
  onSaveContact?: (values: {
    website: string;
    businessEmail: string;
    businessPhone: string;
    address?: {
      address?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
  }) => Promise<void>;
  servicesSlot?: {
    children: React.ReactNode;
  };
  payoutsSlot?: {
    children: React.ReactNode;
  };
  logoUploading: boolean;
  logoUploadProgress: number | null;
  onLogoChange: (files: FileList | File[]) => void;
  isSaving: boolean;
  saveError: string | null;
  onEditBasics?: () => void;
  onEditContact?: () => void;
  onSaveAll?: () => void;
}

const OnboardingActions: FunctionComponent<OnboardingActionsProps> = ({
  status,
  servicesSlot,
  payoutsSlot,
  logoUploading,
  logoUploadProgress,
  onLogoChange,
  isSaving,
  saveError,
  onEditBasics,
  onEditContact,
  onSaveAll,
}) => {
  const completionScore = (() => {
    const checks = [status.basicsComplete, status.contactComplete, status.servicesComplete, status.payoutsComplete];
    const completedCount = checks.filter(Boolean).length;
    return Math.round((completedCount / checks.length) * 100);
  })();
  const missingFields: string[] = [];
  if (!status.basicsComplete) missingFields.push('practice name', 'slug');
  if (!status.contactComplete) missingFields.push('contact information');
  if (!status.servicesComplete) missingFields.push('services');
  if (!status.payoutsComplete) missingFields.push('payment setup');
  
  // Address is optional for remote practices
  const isRemotePractice = false; // This would come from state
  if (!isRemotePractice && !status.contactComplete) {
    missingFields.push('address');
  }

  return (
    <div className="space-y-6">
      {/* Progress Overview */}
      <section className="glass-card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-input-text">Setup Progress</h3>
            <p className="text-sm text-input-placeholder mt-1">
              Complete your profile to start accepting clients
            </p>
          </div>
          <div className="relative">
            <ProgressRing
              progress={completionScore}
              useTrafficLights
              size={64}
              fontSize="10px"
            >
              <span className="font-bold">{Math.round(completionScore)}%</span>
            </ProgressRing>
          </div>
        </div>

        {missingFields.length > 0 && (
          <div className="rounded-xl bg-accent-warning/10 border border-accent-warning/30 p-3">
            <p className="text-sm text-yellow-800">
              <strong>Still needed:</strong> {missingFields.join(', ')}
            </p>
          </div>
        )}

        {saveError && (
          <div className="rounded-xl bg-accent-error/10 border border-accent-error/30 p-3">
            <p className="text-sm text-accent-error-foreground">
              <strong>Error:</strong> {saveError}
            </p>
          </div>
        )}
      </section>

      {/* Action Buttons */}
      <section className="glass-card p-4 sm:p-5">
        <h3 className="text-lg font-semibold text-input-text mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-4">
          {onEditBasics && (
            <Button 
              variant="secondary" 
              onClick={onEditBasics}
              disabled={isSaving}
            >
              Edit Practice Info
            </Button>
          )}
          
          {onEditContact && (
            <Button 
              variant="secondary" 
              onClick={onEditContact}
              disabled={isSaving}
            >
              Edit Contact Details
            </Button>
          )}

          {onSaveAll && (
            <Button 
              variant="primary" 
              onClick={onSaveAll}
              disabled={isSaving || logoUploading}
            >
              {isSaving ? 'Saving...' : 'Save All Changes'}
            </Button>
          )}
        </div>

        {/* Logo Upload */}
        <div className="mt-6">
          <h4 className="text-sm font-medium text-input-text mb-2">Practice Logo</h4>
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const files = (e.target as HTMLInputElement).files;
                if (files && files.length > 0) {
                  onLogoChange(files);
                }
              }}
              disabled={isSaving}
              className="hidden"
              id="logo-upload"
            />
            <Button
              variant="secondary"
              onClick={() => {
                const input = document.getElementById('logo-upload') as HTMLInputElement;
                input?.click();
              }}
              disabled={isSaving || logoUploading}
            >
              {logoUploading ? (
                <span className="inline-flex items-center">
                  <LoadingSpinner size="sm" className="mr-2" />
                  {logoUploadProgress != null ? `${logoUploadProgress}%` : 'Choose Logo'}
                </span>
              ) : (
                'Choose Logo'
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* Additional Slots */}
      {servicesSlot && (
        <section className="glass-card p-4 sm:p-5">
          {servicesSlot}
        </section>
      )}

      {payoutsSlot && (
        <section className="glass-card p-4 sm:p-5">
          {payoutsSlot}
        </section>
      )}
    </div>
  );
};

export default OnboardingActions;
