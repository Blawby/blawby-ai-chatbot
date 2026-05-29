import { useState } from 'preact/hooks';
import type { FunctionComponent } from 'preact';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/input/Input';
import { SegmentedToggle } from '@/shared/ui/input/SegmentedToggle';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { reportsApi } from '@/features/reports/services/reportsApi';
import type { ReportFrequency } from '@/features/reports/services/reportsTypes';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  practiceId: string;
  reportType: string;
  filters: Record<string, string>;
  onCreated?: () => void;
}

const FREQ_OPTIONS: ReadonlyArray<{ value: ReportFrequency; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export const ScheduleModal: FunctionComponent<ScheduleModalProps> = ({
  isOpen,
  onClose,
  practiceId,
  reportType,
  filters,
  onCreated,
}) => {
  const [frequency, setFrequency] = useState<ReportFrequency>('weekly');
  const [hourUtc, setHourUtc] = useState(9);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [recipientsInput, setRecipientsInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { showError, showSuccess } = useToastContext();

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const recipients = recipientsInput
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);
      await reportsApi.createSchedule(practiceId, {
        reportType,
        frequency,
        dayOfWeek: frequency === 'weekly' ? dayOfWeek : undefined,
        dayOfMonth: frequency === 'monthly' ? dayOfMonth : undefined,
        hourUtc,
        recipients,
        filters,
        active: true,
      });
      showSuccess('Schedule created');
      onCreated?.();
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create schedule');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Schedule report">
      <DialogBody>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink">Frequency</span>
            <SegmentedToggle<ReportFrequency>
              value={frequency}
              options={FREQ_OPTIONS}
              ariaLabel="Frequency"
              onChange={setFrequency}
            />
          </div>
          <Input
            label="Hour (UTC, 0-23)"
            type="number"
            min={0}
            max={23}
            value={String(hourUtc)}
            onChange={(v) => setHourUtc(Number(v) || 0)}
          />
          {frequency === 'weekly' ? (
            <Input
              label="Day of week (0=Sun … 6=Sat)"
              type="number"
              min={0}
              max={6}
              value={String(dayOfWeek)}
              onChange={(v) => setDayOfWeek(Number(v) || 0)}
            />
          ) : null}
          {frequency === 'monthly' ? (
            <Input
              label="Day of month (1-28)"
              type="number"
              min={1}
              max={28}
              value={String(dayOfMonth)}
              onChange={(v) => setDayOfMonth(Number(v) || 1)}
            />
          ) : null}
          <Input
            label="Recipients (user IDs, comma-separated)"
            value={recipientsInput}
            onChange={setRecipientsInput}
            placeholder="user_123, user_456"
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={submitting}>{submitting ? 'Saving…' : 'Create schedule'}</Button>
      </DialogFooter>
    </Dialog>
  );
};

export default ScheduleModal;
