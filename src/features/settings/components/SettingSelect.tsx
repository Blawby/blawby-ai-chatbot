import { Combobox, type ComboboxOption } from '@/shared/ui/input/Combobox';
import { FormLabel } from '@/shared/ui/form';
import { SettingDescription } from './SettingDescription';
import { cn } from '@/shared/utils/cn';

export interface SettingSelectProps {
  label: string;
  description?: string;
  value: string;
  options: ComboboxOption[];
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
        <Combobox
          value={value}
          options={options}
          onChange={onChange}
          className={cn(
            'min-w-[180px] rounded-full border border-line-glass/30 bg-surface-glass/40 px-4 py-2 text-sm text-input-text hover:bg-surface-glass/50 focus:ring-2 focus:ring-accent-500'
          )}
          searchable={false}
        />
      </div>
    </div>
  );
};
