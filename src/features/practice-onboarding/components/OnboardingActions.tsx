/**
 * OnboardingActions - Handles onboarding action buttons and progress
 *
 * Extracts action logic from PracticeSetup to provide cleaner separation
 * between chat interface and action buttons.
 */

import { FunctionComponent } from 'preact';
import { Button } from '@/shared/ui/Button';
import { CompletionRing } from '@/shared/ui/CompletionRing';
import type { PracticeSetupStatus } from '../../practice-setup/utils/status';
import type { Practice } from '@/shared/hooks/usePracticeManagement';

export interface OnboardingActionsProps {
  status: PracticeSetupStatus;
  onSaveBasics?: (values: {
    name: string;
    slug: string;
    introMessage: string;
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
  onSaveBasics,
  onSaveContact,
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
  const completionScore = status.basicsComplete && status.contactComplete && status.servicesComplete && status.payoutsComplete ? 100 : 0;
  const missingFields: string[] = [];
  if (!status.basicsComplete) missingFields.push('practice name', 'slug', 'intro message');
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
            <CompletionRing 
              score={completionScore} 
              size={64}
            />
          </div>
        </div>

        {missingFields.length > 0 && (
          <div className="rounded-xl bg-yellow-50/10 border border-yellow-200/30 p-3">
            <p className="text-sm text-yellow-800">
              <strong>Still needed:</strong> {missingFields.join(', ')}
            </p>
          </div>
        )}

        {saveError && (
          <div className="rounded-xl bg-red-50/10 border border-red-200/30 p-3">
            <p className="text-sm text-red-800">
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
              {logoUploading ? `Uploading... ${logoUploadProgress ? `${logoUploadProgress}%` : ''}` : 'Choose Logo'}
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
