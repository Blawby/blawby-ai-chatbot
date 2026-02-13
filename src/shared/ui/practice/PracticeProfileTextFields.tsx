import { Textarea } from '@/shared/ui/input';

interface PracticeProfileTextFieldsProps {
  introMessage?: string;
  onIntroChange?: (value: string) => void;
  introRows?: number;
  introLabel?: string;
  introPlaceholder?: string;
  disabled?: boolean;
  inputClassName?: string;
}

export const PracticeProfileTextFields = ({
  introMessage,
  onIntroChange,
  introRows = 4,
  introLabel = 'Intro Message',
  introPlaceholder = 'Welcome to our firm. How can we help?',
  disabled = false,
  inputClassName
}: PracticeProfileTextFieldsProps) => (
  <Textarea
    label={introLabel}
    value={introMessage || ''}
    onChange={(value) => onIntroChange?.(value)}
    placeholder={introPlaceholder}
    rows={introRows}
    disabled={disabled}
    className={inputClassName}
  />
);
