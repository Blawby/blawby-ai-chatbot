import type { FunctionComponent } from 'preact';
import {
  BarChart3,
  Briefcase,
  Calendar,
  Clock,
  FileText,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-preact';

import { cn } from '@/shared/utils/cn';
import type {
  ReportDefinition,
  ReportIconName,
} from '@/features/reports/config/reportCollection';

const ICON_BY_NAME: Record<ReportIconName, typeof TrendingUp> = {
  trending: TrendingUp,
  file: FileText,
  wallet: Wallet,
  clock: Clock,
  users: Users,
  briefcase: Briefcase,
  chart: BarChart3,
  calendar: Calendar,
};

interface ReportCardProps {
  definition: ReportDefinition;
  onClick?: () => void;
  className?: string;
}

export const ReportCard: FunctionComponent<ReportCardProps> = ({ definition, onClick, className }) => {
  const Icon = ICON_BY_NAME[definition.icon] ?? TrendingUp;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full flex-col gap-2 rounded-2xl border border-line-subtle bg-paper-2/5 p-4 text-left transition hover:bg-paper-2/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-line-subtle bg-paper-2/10">
          <Icon className="h-4 w-4 text-dim-2" aria-hidden="true" />
        </div>
        {definition.phase === 3 ? (
          <span className="rounded-full bg-paper-2/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-dim-2">
            Coming soon
          </span>
        ) : null}
      </div>
      <h3 className="text-sm font-semibold text-ink">{definition.title}</h3>
      <p className="text-xs text-dim-2">{definition.description}</p>
    </button>
  );
};

export default ReportCard;
