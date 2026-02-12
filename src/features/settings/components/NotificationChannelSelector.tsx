import { Select, type SelectOption } from '@/shared/ui/input';
import { cn } from '@/shared/utils/cn';

export interface NotificationChannel {
  key: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
}

export interface NotificationChannelSelectorProps {
  displayText: string;
  channels: NotificationChannel[];
  onSelectionChange: (nextSelection: { push: boolean; email: boolean }) => void;
  className?: string;
  noneLabel?: string;
  bothLabel?: string;
}

export const NotificationChannelSelector = ({
  displayText,
  channels,
  onSelectionChange,
  className = '',
  noneLabel = 'None',
  bothLabel
}: NotificationChannelSelectorProps) => {
  const pushChannel = channels.find((channel) => channel.key === 'push');
  const emailChannel = channels.find((channel) => channel.key === 'email');
  const isDisabled = channels.every((channel) => channel.disabled);
  const hasPush = Boolean(pushChannel?.checked);
  const hasEmail = Boolean(emailChannel?.checked);

  const currentValue = isDisabled
    ? 'required'
    : hasPush && hasEmail
      ? 'both'
      : hasPush
        ? 'push'
        : hasEmail
          ? 'email'
          : 'none';

  const resolvedBothLabel = bothLabel || `${pushChannel?.label ?? 'Push'} + ${emailChannel?.label ?? 'Email'}`;

  const options: SelectOption[] = isDisabled
    ? [{ value: 'required', label: displayText }]
    : [
      ...(pushChannel && emailChannel ? [{ value: 'both', label: resolvedBothLabel }] : []),
      ...(pushChannel ? [{ value: 'push', label: pushChannel.label }] : []),
      ...(emailChannel ? [{ value: 'email', label: emailChannel.label }] : []),
      { value: 'none', label: noneLabel }
    ];

  return (
    <div className={cn('ml-4', className)}>
      <Select
        value={currentValue}
        options={options}
        onChange={(nextValue) => {
          if (isDisabled) return;
          const enablePush = pushChannel ? nextValue === 'push' || nextValue === 'both' : false;
          const enableEmail = emailChannel ? nextValue === 'email' || nextValue === 'both' : false;
          onSelectionChange({ push: enablePush, email: enableEmail });
        }}
        disabled={isDisabled}
        className={cn(
          'min-w-[180px] rounded-full border border-gray-300 bg-transparent px-4 py-2 text-sm text-gray-900',
          'border-line-default bg-transparent text-input-text',
          'hover:bg-transparent dark:hover:bg-transparent focus:ring-2 focus:ring-accent-500'
        )}
      />
    </div>
  );
};
