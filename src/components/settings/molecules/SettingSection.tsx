import { ComponentChildren } from 'preact';
import { SettingDescription } from '../atoms';
import { cn } from '../../../utils/cn';

export interface SettingSectionProps {
  title: string;
  description?: string;
  children: ComponentChildren;
  className?: string;
}

export const SettingSection = ({
  title,
  description,
  children,
  className = ''
}: SettingSectionProps) => {
  return (
    <div className={cn('py-3', className)}>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </h3>
      {description && <SettingDescription text={description} className="mb-4" />}
      {children}
    </div>
  );
};

