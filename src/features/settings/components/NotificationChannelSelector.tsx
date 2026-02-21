import { Combobox, type ComboboxOption } from '@/shared/ui/input/Combobox';
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

  const options: ComboboxOption[] = isDisabled
    ? [{ value: 'required', label: displayText }]
    : [
      ...(pushChannel && emailChannel ? [{ value: 'both', label: resolvedBothLabel }] : []),
      ...(pushChannel ? [{ value: 'push', label: pushChannel.label }] : []),
      ...(emailChannel ? [{ value: 'email', label: emailChannel.label }] : []),
      { value: 'none', label: noneLabel }
    ];

  return (
    <div className={cn('ml-4', className)}>
      <Combobox
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
          'min-w-[180px] [&_[role=combobox]]:rounded-xl'
        )}
        clearable={false}
        searchable={false}
      />
    </div>
  );
};
