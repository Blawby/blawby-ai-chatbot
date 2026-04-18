import { Button } from '@/shared/ui/Button';
import { Panel } from '@/shared/ui/layout/Panel';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { getMajorAmountValue } from '@/shared/utils/money';
import type { MatterDetail } from '@/features/matters/data/matterTypes';
import type { UnbilledSummary } from '@/features/matters/types/billing.types';

type UnbilledSummaryCardProps = {
  summary: UnbilledSummary;
  matter: MatterDetail;
  onCreateInvoice: () => void;
  onInvoiceMilestone?: (milestoneId: string) => void;
  onEnterSettlement?: () => void;
};

export const UnbilledSummaryCard = ({
  summary,
  matter,
  onCreateInvoice,
  onInvoiceMilestone,
  onEnterSettlement
}: UnbilledSummaryCardProps) => {
  if (matter.billingType === 'pro_bono') {
    return (
      <Panel className="p-6">
        <h3 className="text-sm font-semibold text-input-text">Pro Bono Matter</h3>
        <p className="mt-2 text-sm text-input-placeholder">
          Time tracked: {summary.unbilledTime.hours.toFixed(1)} hrs
        </p>
        <p className="mt-2 text-xs italic text-input-placeholder">
          This matter is tracked for internal reporting only. No invoices will be generated.
        </p>
      </Panel>
    );
  }

  if (matter.billingType === 'contingency') {
    const settlementAmount = getMajorAmountValue(matter.settlementAmount);
    const hasSettlement = matter.settlementAmount !== null && matter.settlementAmount !== undefined;
    const percent = matter.contingencyPercent ?? 0;
    const fee = (settlementAmount * percent) / 100;
    return (
      <Panel className="p-6">
        <h3 className="text-sm font-semibold text-input-text">Contingency Billing</h3>
        <p className="mt-2 text-sm text-input-placeholder">
          Settlement: {hasSettlement ? formatCurrency(settlementAmount) : 'Not entered'}
        </p>
        <p className="mt-1 text-sm text-input-placeholder">Fee: {percent}%</p>
        <p className="mt-3 text-base font-semibold text-input-text">
          Potential invoice: {formatCurrency(fee)}
        </p>
        {hasSettlement && settlementAmount > 0 ? (
          <Button className="mt-4" onClick={onCreateInvoice}>
            Create Contingency Invoice
          </Button>
        ) : (
          <Button className="mt-4" variant="secondary" onClick={() => onEnterSettlement?.()} disabled={!onEnterSettlement}>
            Enter Settlement to Invoice
          </Button>
        )}
      </Panel>
    );
  }

  if (matter.billingType === 'fixed' && matter.paymentFrequency === 'milestone') {
    return (
      <Panel className="p-6">
        <h3 className="text-sm font-semibold text-input-text">Milestone Billing</h3>
        <p className="mt-2 text-sm text-input-placeholder">
          {(matter.milestones ?? []).length} milestones configured for this matter.
        </p>
        <div className="mt-4 space-y-2">
          {(matter.milestones ?? []).map((milestone) => {
            if (!milestone.id) return null;
            return (
              <div key={milestone.id} className="flex items-center justify-between rounded-xl border border-line-glass/30 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-input-text">{milestone.description}</p>
                  <p className="text-xs text-input-placeholder">{formatCurrency(milestone.amount)}</p>
                </div>
                <Button
                  size="xs"
                  onClick={() => onInvoiceMilestone?.(milestone.id)}
                  disabled={!onInvoiceMilestone || milestone.status === 'completed'}
                >
                  {milestone.status === 'completed' ? 'Invoiced' : 'Invoice'}
                </Button>
              </div>
            );
          })}
        </div>
      </Panel>
    );
  }

  if (matter.billingType === 'fixed' && matter.paymentFrequency === 'project') {
    return (
      <Panel className="p-6">
        <h3 className="text-sm font-semibold text-input-text">Project Billing</h3>
        <p className="mt-2 text-sm text-input-placeholder">
          Fixed total: {formatCurrency(matter.totalFixedPrice ?? 0)}
        </p>
        <Button className="mt-4" onClick={onCreateInvoice}>
          Create Project Invoice
        </Button>
      </Panel>
    );
  }

  return (
    <Panel className="p-6">
      <h3 className="text-sm font-semibold text-input-text">Ready to Invoice</h3>
      <div className="mt-3 space-y-1 text-sm text-input-placeholder">
        <p>Unbilled time: {summary.unbilledTime.hours.toFixed(1)} hrs</p>
        <p>Unbilled expenses: {formatCurrency(summary.unbilledExpenses.amount)}</p>
      </div>
      <p className="mt-4 text-base font-semibold text-input-text">
        Total unbilled: {formatCurrency(summary.totalUnbilled)}
      </p>
      <Button className="mt-4" onClick={onCreateInvoice} disabled={getMajorAmountValue(summary.totalUnbilled) <= 0}>
        Create Invoice
      </Button>
    </Panel>
  );
};
