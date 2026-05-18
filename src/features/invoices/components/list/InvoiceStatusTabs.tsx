import { Tabs } from '@/shared/ui/tabs';
import type { InvoiceListAggregates } from '@/features/invoices/hooks/useInvoiceListAggregates';

export type InvoiceTabId = 'all' | 'draft' | 'open' | 'pastDue' | 'paid';

export const INVOICE_TAB_STATUS_MAP: Record<InvoiceTabId, string[]> = {
  all: [],
  draft: ['draft'],
  open: ['sent', 'open', 'pending'],
  pastDue: ['overdue'],
  paid: ['paid'],
};

interface InvoiceStatusTabsProps {
  activeTab: InvoiceTabId;
  onChange: (id: InvoiceTabId) => void;
  aggregates: InvoiceListAggregates;
}

export const InvoiceStatusTabs = ({ activeTab, onChange, aggregates }: InvoiceStatusTabsProps) => {
  const items = [
    { id: 'all', label: 'All', count: aggregates.tabCounts.all },
    { id: 'draft', label: 'Draft', count: aggregates.tabCounts.draft },
    { id: 'open', label: 'Open', count: aggregates.tabCounts.open },
    { id: 'pastDue', label: 'Past due', count: aggregates.tabCounts.pastDue },
    { id: 'paid', label: 'Paid', count: aggregates.tabCounts.paid },
  ];
  return (
    <Tabs
      items={items}
      activeId={activeTab}
      onChange={(id) => onChange(id as InvoiceTabId)}
    />
  );
};
