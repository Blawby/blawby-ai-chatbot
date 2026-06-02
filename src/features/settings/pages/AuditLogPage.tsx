// TODO(backend): Required endpoints:
//   - GET /api/practices/:id/audit-log?search=&type=&actor=&range=  → paginated event log
//   - GET /api/practices/:id/audit-log/export?format=csv  → trigger CSV export (sent by email)

import { useState } from 'preact/hooks';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { cn } from '@/shared/utils/cn';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsCard } from '@/features/settings/components/SettingsCard';

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

type EventType = 'ai' | 'update' | 'create' | 'delete' | 'auth';

const DEMO_EVENTS: Array<{ id: string; ts: string; actor: string; actorInitial: string; actorStyle: string; type: EventType; action: string; target: string }> = [
  { id: 'e1', ts: 'Jun 1, 10:42 AM', actor: 'Assistant', actorInitial: 'B', actorStyle: 'background:var(--ink);color:var(--accent);font-style:italic', type: 'ai', action: 'Drafted invoice for Chen v. Williams — awaiting approval', target: 'invoice_0047' },
  { id: 'e2', ts: 'Jun 1, 10:38 AM', actor: 'Sarah Chen', actorInitial: 'SC', actorStyle: 'background:linear-gradient(135deg,#374151,#111827);color:#f9fafb', type: 'update', action: 'Approved staged invoice for matter_0012', target: 'invoice_0047' },
  { id: 'e3', ts: 'Jun 1, 10:22 AM', actor: 'Assistant', actorInitial: 'B', actorStyle: 'background:var(--ink);color:var(--accent);font-style:italic', type: 'ai', action: 'Sent morning briefing email', target: 'sarah@sarahchenlaw.com' },
  { id: 'e4', ts: 'Jun 1, 09:14 AM', actor: 'Stripe', actorInitial: 'S', actorStyle: 'background:#635BFF;color:#fff', type: 'create', action: 'Payment received $2,500.00 from Janet Williams', target: 'pay_3Q8xN2' },
  { id: 'e5', ts: 'Jun 1, 08:50 AM', actor: 'Sarah Chen', actorInitial: 'SC', actorStyle: 'background:linear-gradient(135deg,#374151,#111827);color:#f9fafb', type: 'auth', action: 'Signed in from 74.125.xx.xx (Charlotte, NC)', target: 'session_a8f2' },
  { id: 'e6', ts: 'May 31, 4:55 PM', actor: 'Assistant', actorInitial: 'B', actorStyle: 'background:var(--ink);color:var(--accent);font-style:italic', type: 'ai', action: 'Created calendar event "Thompson custody hearing" for Jul 14', target: 'event_0089' },
  { id: 'e7', ts: 'May 31, 3:20 PM', actor: 'Sarah Chen', actorInitial: 'SC', actorStyle: 'background:linear-gradient(135deg,#374151,#111827);color:#f9fafb', type: 'create', action: 'Created new matter Thompson v. Thompson', target: 'matter_0015' },
  { id: 'e8', ts: 'May 31, 2:44 PM', actor: 'System', actorInitial: 'SY', actorStyle: 'background:var(--rule-soft,#f3f4f6);color:var(--dim)', type: 'update', action: 'Intake form submitted by new lead (family law, DV flagged)', target: 'intake_0041' },
  { id: 'e9', ts: 'May 31, 11:30 AM', actor: 'Sarah Chen', actorInitial: 'SC', actorStyle: 'background:linear-gradient(135deg,#374151,#111827);color:#f9fafb', type: 'update', action: 'Updated retainer threshold to 30% for Services & pricing', target: 'settings' },
  { id: 'e10', ts: 'May 31, 10:15 AM', actor: 'Sarah Chen', actorInitial: 'SC', actorStyle: 'background:linear-gradient(135deg,#374151,#111827);color:#f9fafb', type: 'delete', action: 'Removed draft engagement letter for intake_0038', target: 'doc_0072' },
];

const TYPE_STYLES: Record<EventType, string> = {
  ai: 'text-accent bg-ink border-ink',
  update: 'text-amber-600 bg-amber-50 border-amber-200',
  create: 'text-[var(--pos,#22c55e)] bg-[color-mix(in_oklab,var(--pos,#22c55e)_10%,white)] border-[color-mix(in_oklab,var(--pos,#22c55e)_25%,var(--rule,#e5e7eb))]',
  delete: 'text-[var(--neg,#ef4444)] bg-[color-mix(in_oklab,var(--neg,#ef4444)_10%,white)] border-[color-mix(in_oklab,var(--neg,#ef4444)_25%,var(--rule,#e5e7eb))]',
  auth: 'text-blue-600 bg-blue-50 border-blue-200',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export interface AuditLogPageProps {
  className?: string;
}

export const AuditLogPage = ({ className = '' }: AuditLogPageProps) => {
  const { showSuccess } = useToastContext();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [rangeFilter, setRangeFilter] = useState('7d');

  const filtered = DEMO_EVENTS.filter((e) => {
    if (search && !e.action.toLowerCase().includes(search.toLowerCase()) && !e.actor.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter !== 'all' && e.type !== typeFilter) return false;
    if (actorFilter !== 'all' && e.actor !== actorFilter) return false;
    return true;
  });

  const handleExport = () => {
    // TODO(backend): GET /api/practices/:id/audit-log/export?format=csv
    showSuccess('Export requested', "You'll receive a CSV via email once the export endpoint ships.");
  };

  return (
    <div className={className}>
      <SettingSection first title="Audit log" description="Every action in your workspace is recorded. Use this for compliance reviews, bar audits, and troubleshooting.">
        <SettingsCard className="mb-5 max-w-[860px]">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input flex-1"
            style={{ minWidth: 200 }}
            placeholder="Search events…"
            value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
          />
          <select className="select" value={typeFilter} onChange={(e) => setTypeFilter((e.target as HTMLSelectElement).value)}>
            <option value="all">All types</option>
            <option value="create">Creates</option>
            <option value="update">Updates</option>
            <option value="delete">Deletes</option>
            <option value="auth">Auth events</option>
            <option value="ai">AI actions</option>
          </select>
          <select className="select" value={actorFilter} onChange={(e) => setActorFilter((e.target as HTMLSelectElement).value)}>
            <option value="all">All actors</option>
            <option value="Sarah Chen">Sarah Chen</option>
            <option value="Assistant">Assistant</option>
            <option value="System">System</option>
          </select>
          <select className="select" value={rangeFilter} onChange={(e) => setRangeFilter((e.target as HTMLSelectElement).value)} style={{ width: 140 }}>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
          <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={handleExport}>Export CSV</button>
        </div>
        </SettingsCard>

        <SettingsCard className="max-w-[860px] px-0 py-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule">
                {['Timestamp', 'Actor', 'Type', 'Action', 'Target'].map((col) => (
                  <th key={col} className="font-mono text-[10px] uppercase tracking-widest text-dim text-left pb-2 pr-4 last:pr-0">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((event) => (
                <tr key={event.id} className="border-b border-rule last:border-0">
                  <td className="py-3 pr-4 font-mono text-xs text-dim whitespace-nowrap">{event.ts}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="h-5 w-5 rounded-full grid place-items-center font-serif text-[9px] font-bold shrink-0"
                        style={event.actorStyle}
                      >
                        {event.actorInitial}
                      </div>
                      <span className="text-xs text-ink whitespace-nowrap">{event.actor}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={cn('font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border', TYPE_STYLES[event.type])}>
                      {event.type}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-xs text-ink">{event.action}</td>
                  <td className="py-3 font-mono text-xs text-dim">{event.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </SettingsCard>

        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-dim">No events match your filters.</p>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between mt-5 pt-4 border-t border-rule">
          <span className="text-xs text-dim">Showing 1–{filtered.length} of {DEMO_EVENTS.length} events</span>
          <div className="flex gap-1">
            {['1', '2', '3', '…', '85', '→'].map((pg) => (
              <button key={pg} type="button" className={cn('h-7 w-7 rounded font-mono text-xs', pg === '1' ? 'bg-ink text-accent' : 'text-dim hover:bg-rule')}>
                {pg}
              </button>
            ))}
          </div>
        </div>
      </SettingSection>
    </div>
  );
};
