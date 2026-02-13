import { EnvelopeIcon } from '@heroicons/react/24/outline';
import { SettingSection } from './SettingSection';

export interface EmailSettingsSectionProps {
  email: string;
  receiveFeedbackEmails: boolean;
  onFeedbackChange: (checked: boolean) => void;
  title: string;
  feedbackLabel: string;
  showFeedbackToggle?: boolean;
  className?: string;
}

export const EmailSettingsSection = ({
  email,
  receiveFeedbackEmails,
  onFeedbackChange,
  title,
  feedbackLabel,
  showFeedbackToggle = true,
  className = ''
}: EmailSettingsSectionProps) => {
  return (
    <SettingSection title={title} className={className}>
      {/* Email Address */}
      <div className="flex items-center gap-3 py-3">
        <EnvelopeIcon className="w-4 h-4 text-input-placeholder" />
        <span className="text-sm text-input-text">
          {email}
        </span>
      </div>

      {/* Feedback Emails Checkbox */}
      {showFeedbackToggle && (
        <div className="flex items-center gap-3 py-3">
          <input
            type="checkbox"
            id="feedback-emails"
            checked={receiveFeedbackEmails}
            onChange={(e) => onFeedbackChange(e.currentTarget.checked)}
            className="w-4 h-4 text-accent-500 bg-transparent border-line-glass/30 rounded focus:ring-accent-500 focus:ring-2"
          />
          <label htmlFor="feedback-emails" className="text-sm text-input-text cursor-pointer">
            {feedbackLabel}
          </label>
        </div>
      )}
    </SettingSection>
  );
};
