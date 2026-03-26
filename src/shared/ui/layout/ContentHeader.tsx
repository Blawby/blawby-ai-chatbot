import type { ComponentChildren } from 'preact';
import { SectionDivider } from './SectionDivider';
import { cn } from '@/shared/utils/cn';

export interface ContentHeaderProps {
  title: string;
  className?: string;
  headingLevel?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  leading?: ComponentChildren;
  trailing?: ComponentChildren;
}

export const ContentHeader = ({
  title,
  className = '',
  headingLevel = 'h1',
  leading,
  trailing
}: ContentHeaderProps) => {
  const HeadingTag = headingLevel;
  
  return (
    <div className={cn('px-6 py-4', className)}>
      <div className="flex items-center gap-3">
        {leading ? <div className="flex items-center">{leading}</div> : null}
        <HeadingTag className="flex-1 text-lg font-semibold text-input-text">
          {title}
        </HeadingTag>
        {trailing ? <div className="flex items-center">{trailing}</div> : null}
      </div>
      <SectionDivider className="mt-4" />
    </div>
  );
};
