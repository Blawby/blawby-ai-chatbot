import { cn } from '../../../utils/cn';

export interface SettingDescriptionProps {
  text: string;
  className?: string;
}

export const SettingDescription = ({
  text,
  className = ''
}: SettingDescriptionProps) => {
  return (
    <p className={cn('text-xs text-gray-500 dark:text-gray-400 mt-1', className)}>
      {text}
    </p>
  );
};

