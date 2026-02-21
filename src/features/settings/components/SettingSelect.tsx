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
          className="min-w-[180px] [&_[role=combobox]]:rounded-xl"
          clearable={false}
          searchable={false}
        />
      </div>
    </div>
  );
};
