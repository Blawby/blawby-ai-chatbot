import { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface SettingSectionProps {
  title: string;
  description?: string;
  children: ComponentChildren;
  className?: string;
  formClassName?: string;
}

// Parent should wrap multiple sections in `divide-y divide-line-default` to
// get the divided-list rhythm; the section itself draws no border.
export const SettingSection = ({
  title,
  description,
  children,
  className,
  formClassName = 'max-w-xl',
}: SettingSectionProps) => {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-x-8 gap-y-6 py-10 md:grid-cols-3',
        className,
      )}
    >
      <div>
        <h2 className="text-base font-semibold text-input-text">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-input-placeholder">{description}</p>
        ) : null}
      </div>
      <div className={cn('md:col-span-2', formClassName)}>{children}</div>
    </div>
  );
};
