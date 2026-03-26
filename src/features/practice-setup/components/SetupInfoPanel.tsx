import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/utils/cn';
import { StripeOnboardingStep } from '@/features/onboarding/steps/StripeOnboardingStep';
import type { StripeConnectStatus } from '@/features/onboarding/types';
import { SettingsNotice } from '@/features/settings/components/SettingsNotice';

export interface SetupFieldRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly done: boolean;
  readonly listValues?: readonly string[];
}

interface SetupInfoPanelProps {
  className?: string;
  embedded?: boolean;
  fieldRows: readonly SetupFieldRow[];
  canSaveAll?: boolean;
  isSavingAll?: boolean;
  saveAllError?: string | null;
  onSaveAll?: () => void;
  paymentPreference: 'yes' | 'no' | null;
  stripeHasAccount: boolean;
  payoutDetailsSubmitted: boolean;
  isStripeSubmitting: boolean;
  isStripeLoading: boolean;
  stripeStatus: StripeConnectStatus | null;
  onSetPaymentPreference: (value: 'yes' | 'no') => void;
  onStartStripeOnboarding: () => void | Promise<void>;
}

export const SetupInfoPanel = ({
  className = '',
  embedded = false,
  fieldRows,
  canSaveAll = false,
  isSavingAll = false,
  saveAllError = null,
  onSaveAll,
  paymentPreference,
  stripeHasAccount,
  payoutDetailsSubmitted,
  isStripeSubmitting,
  isStripeLoading,
  stripeStatus,
  onSetPaymentPreference,
  onStartStripeOnboarding,
}: SetupInfoPanelProps) => (
  <div className={cn('flex w-full flex-col text-input-text', className)}>
    <div className={cn(!embedded && 'glass-panel p-4')}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">Practice setup fields</div>
        {onSaveAll && canSaveAll ? (
          <Button
            variant="primary"
            size="xs"
            className="h-8 shrink-0 font-bold"
            onClick={onSaveAll}
            disabled={isSavingAll}
          >
            {isSavingAll ? 'Saving...' : 'Save all'}
          </Button>
        ) : null}
      </div>
      {saveAllError ? (
        <div className="mt-3">
          <SettingsNotice variant="danger">
            {saveAllError}
          </SettingsNotice>
        </div>
      ) : null}
      <div className="mt-3 space-y-2">
        {fieldRows.map((row) => (
          <div key={row.key} className="space-y-1.5 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className={row.done ? 'text-input-text' : 'text-input-placeholder'}>
                {row.label}
              </div>
              <div className={cn(
                'shrink-0 text-right text-xs font-medium',
                row.done ? 'text-accent-500' : 'text-input-placeholder'
              )}>
                {row.done ? 'Done' : 'Missing'}
              </div>
            </div>
            <div className="text-xs break-words text-input-placeholder">
              {row.listValues && row.listValues.length > 0 ? (
                <ul className="list-disc list-outside space-y-1 pl-5 text-left">
                  {row.listValues.map((item) => (
                    <li key={`${row.key}-${item}`} className="marker:text-input-placeholder">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                row.value
              )}
            </div>
            {row.key === 'payouts' ? (
              <div className="mt-2">
                {!stripeHasAccount && !payoutDetailsSubmitted ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={paymentPreference === 'yes' ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => {
                        onSetPaymentPreference('yes');
                        void onStartStripeOnboarding();
                      }}
                      disabled={isStripeSubmitting || isStripeLoading}
                    >
                      {isStripeSubmitting ? 'Preparing Stripe…' : 'Yes, set up payments'}
                    </Button>
                    <Button
                      variant={paymentPreference === 'no' ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => onSetPaymentPreference('no')}
                      disabled={isStripeSubmitting}
                    >
                      Not now
                    </Button>
                  </div>
                ) : null}
                {(paymentPreference === 'yes' || stripeHasAccount) && stripeStatus && !payoutDetailsSubmitted ? (
                  <div className="mt-3 glass-panel p-3">
                    <StripeOnboardingStep
                      status={stripeStatus}
                      loading={isStripeLoading}
                      showIntro={false}
                      showInfoCard={false}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default SetupInfoPanel;
