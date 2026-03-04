import { cn } from '@/shared/utils/cn';

export type MatterContextPanelProps = {
  clientName?: string | null;
  assigneeNames?: string[];
  billingLabel?: string | null;
  createdLabel?: string | null;
  updatedLabel?: string | null;
  className?: string;
};

const ContextItem = ({ label, value }: { label: string; value: string }) => (
  <div className="space-y-1">
    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-input-placeholder">
      {label}
    </p>
    <p className="truncate text-sm text-input-text">{value}</p>
  </div>
);

export const MatterContextPanel = ({
  clientName,
  assigneeNames = [],
  billingLabel,
  createdLabel,
  updatedLabel,
  className,
}: MatterContextPanelProps) => {
  const resolvedClient = clientName?.trim() || 'Not set';
  const resolvedAssignees = assigneeNames.length > 0 ? assigneeNames.join(', ') : 'Unassigned';
  const resolvedBilling = billingLabel?.trim() || 'Not set';
  const resolvedCreated = createdLabel?.trim() || 'Unknown';
  const resolvedUpdated = updatedLabel?.trim() || 'Unknown';

  return (
    <section className={cn('glass-panel p-4', className)}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ContextItem label="Client" value={resolvedClient} />
        <ContextItem label="Assignees" value={resolvedAssignees} />
        <ContextItem label="Billing" value={resolvedBilling} />
        <ContextItem label="Created" value={resolvedCreated} />
        <ContextItem label="Updated" value={resolvedUpdated} />
      </div>
    </section>
  );
};

export default MatterContextPanel;
