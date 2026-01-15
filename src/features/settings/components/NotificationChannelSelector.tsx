import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from '@/shared/ui/dropdown';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
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
  onChannelChange: (channelKey: string, checked: boolean) => void;
  className?: string;
}

export const NotificationChannelSelector = ({
  displayText,
  channels,
  onChannelChange,
  className = ''
}: NotificationChannelSelectorProps) => {
  return (
    <div className={cn('ml-4', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <span>{displayText}</span>
          <ChevronDownIcon className="w-4 h-4 text-gray-400" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {channels.map((channel) => (
            <DropdownMenuCheckboxItem
              key={channel.key}
              checked={channel.checked}
              onCheckedChange={(checked) => onChannelChange(channel.key, checked)}
              disabled={channel.disabled}
            >
              {channel.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
