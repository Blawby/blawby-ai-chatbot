import { cn } from '@/shared/utils/cn';

export interface SettingDescriptionProps {
  text: string;
  className?: string;
}

export const SettingDescription = ({
  text,
  className = ''
}: SettingDescriptionProps) => {
  return (
    <p className={cn('text-xs text-input-placeholder mt-1', className)}>
      {text}
    </p>
  );
};

