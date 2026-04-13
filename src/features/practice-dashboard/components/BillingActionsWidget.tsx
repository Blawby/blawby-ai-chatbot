import { Fragment } from 'preact';
import { Button } from '@/shared/ui/Button';
import { Panel } from '@/shared/ui/layout/Panel';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import type { BillingAction } from '@/features/practice-dashboard/hooks/usePracticeBillingData';

const ICONS: Record<BillingAction['reason'], string> = {
 overdue: '🔴',
 retainer: '📉',
 unbilled: '⚠️'
};

type BillingActionsWidgetProps = {
 actions: BillingAction[];
 loading?: boolean;
 error?: string | null;
 onAction?: (action: BillingAction) => void;
 onRefresh?: () => void;
};

export const BillingActionsWidget = ({
 actions,
 loading = false,
 error = null,
 onAction,
 onRefresh
}: BillingActionsWidgetProps) => {
 return (
  <Panel className="flex h-full flex-col">
   <header className="flex items-center justify-between border-b border-line-glass/30 px-5 py-4">
    <div>
     <p className="text-sm font-semibold text-input-text">Billing Actions</p>
     <p className="text-xs text-input-placeholder">Matters that need billing attention</p>
    </div>
    <Button size="xs" variant="secondary" onClick={() => onRefresh?.()} disabled={loading}>
     Refresh
    </Button>
   </header>
   <div className="flex-1 overflow-y-auto px-5 py-4">
    {loading ? (
     <div className="flex items-center justify-center py-8">
      <LoadingSpinner size="md" />
     </div>
    ) : error ? (
     <div className="rounded-lg border border-line-glass/40 bg-surface-glass px-3 py-2 text-sm text-input-text">
      {error}
     </div>
    ) : actions.length === 0 ? (
     <p className="text-sm text-input-placeholder">No billing actions needed right now.</p>
    ) : (
     <div className="space-y-4">
      {actions.map((action) => (
       <Fragment key={action.id}>
        <div className="rounded-xl border border-line-glass/30 bg-surface px-4 py-3">
         <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
           <div className="text-lg" aria-hidden="true">{ICONS[action.reason]}</div>
           <div>
            <p className="font-semibold text-input-text">{action.title}</p>
            {action.subtitle ? (
             <p className="text-xs text-input-placeholder">{action.subtitle}</p>
            ) : null}
            {action.amount != null ? (
             <p className="mt-1 text-sm font-semibold text-input-text">
              {formatCurrency(action.amount)}
             </p>
            ) : null}
            {action.highlight ? (
             <p className="mt-1 text-xs text-accent-200">{action.highlight}</p>
            ) : null}
           </div>
          </div>
          <Button size="xs" onClick={() => onAction?.(action)}>
           {action.ctaLabel}
          </Button>
         </div>
        </div>
       </Fragment>
      ))}
     </div>
    )}
   </div>
  </Panel>
 );
};
