import { ComponentChildren } from 'preact';
import { SettingHeader } from './SettingHeader';
import { cn } from '@/shared/utils/cn';

export interface SettingsPageLayoutProps {
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

export const SettingsPageLayout = ({
  title,
  children,
  className = '',
  headerClassName = '',
  contentClassName = '',
  listClassName = '',
  wrapChildren = true,
  headerLeading,
  headerTrailing
}: SettingsPageLayoutProps) => {
  return (
    <div className={cn('h-full flex flex-col', className)}>
      <SettingHeader
        title={title}
        className={headerClassName}
        leading={headerLeading}
        trailing={headerTrailing}
      />
      <div className={cn('flex-1 overflow-y-auto px-6', contentClassName)}>
        {wrapChildren ? (
          <div className={cn('space-y-0', listClassName)}>
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
};
