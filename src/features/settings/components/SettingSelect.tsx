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
            'border-0 bg-transparent px-3 py-1 hover:bg-gray-50 dark:hover:bg-gray-700',
            'focus:ring-2 focus:ring-accent-500'
          )}
        />
      </div>
    </div>
  );
};
