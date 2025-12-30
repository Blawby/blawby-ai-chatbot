import { Switch } from '@/shared/ui/input';
import { FormLabel } from '@/shared/ui/form';
import { SettingDescription } from './SettingDescription';
import { cn } from '@/shared/utils/cn';

export interface SettingToggleProps {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  id?: string;
  className?: string;
}

export const SettingToggle = ({
  label,
  description,
  value,
  onChange,
  id,
  className = ''
}: SettingToggleProps) => {
  return (
    <div className={cn('flex items-center justify-between py-3', className)}>
      <div className="flex-1 min-w-0">
        <FormLabel htmlFor={id}>{label}</FormLabel>
        {description && <SettingDescription text={description} />}
      </div>
      <div className="ml-4">
        <Switch
          id={id}
          value={value}
          onChange={onChange}
          disabled={false}
        />
      </div>
    </div>
  );
};
