/**
 * PracticeProfileTextFields - shared description/intro fields for onboarding and settings.
 */

import { Textarea } from '@/shared/ui/input';

interface PracticeProfileTextFieldsProps {
  description?: string;
  introMessage?: string;
  onDescriptionChange?: (value: string) => void;
  onIntroChange?: (value: string) => void;
  showDescription?: boolean;
  showIntro?: boolean;
  descriptionRows?: number;
  introRows?: number;
  descriptionLabel?: string;
  descriptionPlaceholder?: string;
  introLabel?: string;
  introPlaceholder?: string;
  disabled?: boolean;
}

export const PracticeProfileTextFields = ({
  description,
  introMessage,
  onDescriptionChange,
  onIntroChange,
  showDescription = true,
  showIntro = true,
  descriptionRows = 4,
  introRows = 4,
  descriptionLabel = 'Business description',
  descriptionPlaceholder = 'Share a brief description of your practice.',
  introLabel = 'Intro Message',
  introPlaceholder = 'Welcome to our firm. How can we help?',
  disabled = false
}: PracticeProfileTextFieldsProps) => {
  return (
    <div className="space-y-4">
      {showDescription && (
        <Textarea
          label={descriptionLabel}
          value={description || ''}
          onChange={(value) => onDescriptionChange?.(value)}
          placeholder={descriptionPlaceholder}
          rows={descriptionRows}
          disabled={disabled}
        />
      )}

      {showIntro && (
        <Textarea
          label={introLabel}
          value={introMessage || ''}
          onChange={(value) => onIntroChange?.(value)}
          placeholder={introPlaceholder}
          rows={introRows}
          disabled={disabled}
        />
      )}
    </div>
  );
};
