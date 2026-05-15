import type { FunctionComponent } from 'preact';
import { Download, CalendarClock, Send } from 'lucide-preact';
import { Button } from '@/shared/ui/Button';
import type { ReportDefinition } from '@/features/reports/config/reportCollection';

interface ReportToolbarProps {
  definition: ReportDefinition;
  onExport?: () => void;
  onSchedule?: () => void;
  onSendNow?: () => void;
  exporting?: boolean;
}

export const ReportToolbar: FunctionComponent<ReportToolbarProps> = ({
  definition,
  onExport,
  onSchedule,
  onSendNow,
  exporting,
}) => {
  const disabled = definition.phase === 3;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        icon={Download}
        disabled={disabled || exporting}
        onClick={onExport}
      >
        Export CSV
      </Button>
      <Button
        size="sm"
        variant="secondary"
        icon={Send}
        disabled={disabled}
        onClick={onSendNow}
      >
        Send now
      </Button>
      <Button
        size="sm"
        variant="secondary"
        icon={CalendarClock}
        disabled={disabled}
        onClick={onSchedule}
      >
        Schedule
      </Button>
    </div>
  );
};

export default ReportToolbar;
