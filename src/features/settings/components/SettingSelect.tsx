import { Select, type SelectOption } from '@/shared/ui/input';
import { FormLabel } from '@/shared/ui/form';
import { SettingDescription } from './SettingDescription';
import { cn } from '@/shared/utils/cn';

export interface SettingSelectProps {
  label: string;
  description?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
}

export const SettingSelect = ({
  label,
  description,
  value,
  options,
  onChange,
  className = ''
}: SettingSelectProps) => {
  return (
    <div className={cn('flex items-center justify-between py-3', className)}>
      <div className="flex-1 min-w-0">
        <FormLabel>{label}</FormLabel>
        {description && <SettingDescription text={description} />}
      </div>
      <div className="ml-4">
        <Select
          value={value}
          options={options}
          onChange={onChange}
          className={cn(
            'min-w-[180px] rounded-full border border-gray-300 bg-transparent px-4 py-2 text-sm text-gray-900',
            'border-line-default bg-transparent text-input-text',
            'hover:bg-transparent dark:hover:bg-transparent focus:ring-2 focus:ring-accent-500'
          )}
        />
      </div>
    </div>
  );
};
