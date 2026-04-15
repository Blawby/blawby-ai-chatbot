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
  controlClassName?: string;
  layout?: 'responsive' | 'stacked';
}

export const SettingRow = ({
  label,
  labelClassName = '',
  labelNode,
  description,
  children,
  className = '',
  controlClassName,
  layout = 'responsive',
}: SettingRowProps) => {
  const isStacked = layout === 'stacked';

  return (
    <div
      className={cn(
        'flex flex-col gap-3 py-3',
        !isStacked && 'sm:flex-row sm:items-start sm:justify-between',
        className
      )}
    >
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
        <div className={cn('w-full self-start', !isStacked && 'sm:ml-4 sm:w-auto', controlClassName)}>
          {children}
        </div>
      )}
    </div>
  );
};
