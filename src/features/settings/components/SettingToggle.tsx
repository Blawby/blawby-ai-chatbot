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
  <div className={cn('flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between', className)}>
   <div className="flex-1 min-w-0">
    <FormLabel htmlFor={id}>{label}</FormLabel>
    {description && <SettingDescription text={description} />}
   </div>
   <div className="w-full sm:ml-4 sm:flex sm:w-auto sm:justify-end">
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
