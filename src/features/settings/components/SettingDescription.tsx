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
    <p className={cn('mt-1 text-xs text-dim-2', className)}>
      {text}
    </p>
  );
};
