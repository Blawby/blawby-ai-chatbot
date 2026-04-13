import type { ComponentChildren } from 'preact';
import { ContentHeader } from './ContentHeader';
import { cn } from '@/shared/utils/cn';

export interface ContentPageLayoutProps {
 title: string;
 children: ComponentChildren;
 className?: string;
 headerClassName?: string;
 contentClassName?: string;
 listClassName?: string;
 wrapChildren?: boolean;
 headerLeading?: ComponentChildren;
 headerTrailing?: ComponentChildren;
}

export const ContentPageLayout = ({
 title,
 children,
 className = '',
 headerClassName = '',
 contentClassName = '',
 listClassName = '',
 wrapChildren = true,
 headerLeading,
 headerTrailing
}: ContentPageLayoutProps) => {
 return (
  <div className={cn('h-full overflow-y-auto', className)}>
   <div className="flex flex-col">
    <ContentHeader
     title={title}
     className={headerClassName}
     leading={headerLeading}
     trailing={headerTrailing}
    />
    <div className={cn('px-6', contentClassName)}>
     {wrapChildren ? (
      <div className={cn('space-y-0', listClassName)}>
       {children}
      </div>
     ) : (
      children
     )}
    </div>
   </div>
  </div>
 );
};
