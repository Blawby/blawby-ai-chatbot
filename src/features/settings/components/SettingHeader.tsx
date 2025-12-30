import { SectionDivider } from '@/shared/ui/layout';
import { cn } from '@/shared/utils/cn';

export interface SettingHeaderProps {
  title: string;
  className?: string;
}

export const SettingHeader = ({
  title,
  className = ''
}: SettingHeaderProps) => {
  return (
    <div className={cn('px-6 py-4', className)}>
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </h1>
      <SectionDivider className="mt-4" />
    </div>
  );
};

