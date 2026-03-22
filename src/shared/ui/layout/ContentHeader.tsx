import type { ComponentChildren } from 'preact';
import { SectionDivider } from './SectionDivider';
import { cn } from '@/shared/utils/cn';

export interface ContentHeaderProps {
  title: string;
  className?: string;
  leading?: ComponentChildren;
  trailing?: ComponentChildren;
}

export const ContentHeader = ({
  title,
  className = '',
  leading,
  trailing
}: ContentHeaderProps) => {
  return (
    <div className={cn('px-6 py-4', className)}>
      <div className="flex items-center gap-3">
        {leading ? <div className="flex items-center">{leading}</div> : null}
        <h1 className="flex-1 text-lg font-semibold text-input-text">
          {title}
        </h1>
        {trailing ? <div className="flex items-center">{trailing}</div> : null}
      </div>
      <SectionDivider className="mt-4" />
    </div>
  );
};
