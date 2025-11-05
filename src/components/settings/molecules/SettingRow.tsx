import { ComponentChildren } from 'preact';
import { FormLabel } from '../../ui/form';
import { SettingDescription } from '../atoms';
import { cn } from '../../../utils/cn';

export interface SettingRowProps {
  label: string;
  description?: string | ComponentChildren;
  children: ComponentChildren;
  className?: string;
}

export const SettingRow = ({
  label,
  description,
  children,
  className = ''
}: SettingRowProps) => {
  return (
    <div className={cn('flex items-center justify-between py-3', className)}>
      <div className="flex-1 min-w-0">
        <FormLabel>{label}</FormLabel>
        {description && (
          typeof description === 'string' ? (
            <SettingDescription text={description} />
          ) : (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {description}
            </div>
          )
        )}
      </div>
      <div className="ml-4">
        {children}
      </div>
    </div>
  );
};

