import { ComponentChildren } from 'preact';
import { FormLabel } from '@/shared/ui/form';
import { SettingDescription } from './SettingDescription';
import { cn } from '@/shared/utils/cn';

export interface SettingRowProps {
  label: string;
  labelClassName?: string;
  labelNode?: ComponentChildren;
  description?: string | ComponentChildren;
  children?: ComponentChildren;
  className?: string;
}

export const SettingRow = ({
  label,
  labelClassName = '',
  labelNode,
  description,
  children,
  className = ''
}: SettingRowProps) => {
  return (
    <div className={cn('flex items-center justify-between py-3', className)}>
      <div className="flex-1 min-w-0">
        {labelNode ?? <FormLabel className={labelClassName}>{label}</FormLabel>}
        {description && (
          typeof description === 'string' ? (
            <SettingDescription text={description} />
          ) : (
            <div className="text-xs text-input-placeholder mt-1">
              {description}
            </div>
          )
        )}
      </div>
      {children !== undefined && children !== null && (
        <div className="ml-4">
          {children}
        </div>
      )}
    </div>
  );
};
