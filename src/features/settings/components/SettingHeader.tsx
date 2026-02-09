import type { ComponentChildren } from 'preact';
import { SectionDivider } from '@/shared/ui/layout';
import { cn } from '@/shared/utils/cn';

export interface SettingHeaderProps {
  title: string;
  className?: string;
  leading?: ComponentChildren;
  trailing?: ComponentChildren;
}

export const SettingHeader = ({
  title,
  className = '',
  leading,
  trailing
}: SettingHeaderProps) => {
  return (
    <div className={cn('px-6 py-4', className)}>
      <div className="flex items-center gap-3">
        {leading ? <div className="flex items-center">{leading}</div> : null}
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex-1">
          {title}
        </h1>
        {trailing ? <div className="flex items-center">{trailing}</div> : null}
      </div>
      <SectionDivider className="mt-4" />
    </div>
  );
};
