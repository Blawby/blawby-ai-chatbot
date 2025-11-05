import { Select, type SelectOption } from '../../ui/input';
import { FormLabel } from '../../ui/form';
import { SettingDescription } from '../atoms';
import { cn } from '../../../utils/cn';

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
        />
      </div>
    </div>
  );
};

