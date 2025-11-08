import { EnvelopeIcon } from '@heroicons/react/24/outline';
import { SettingSection } from './SettingSection';

export interface EmailSettingsSectionProps {
  email: string;
  receiveFeedbackEmails: boolean;
  onFeedbackChange: (checked: boolean) => void;
  title: string;
  feedbackLabel: string;
  className?: string;
}

export const EmailSettingsSection = ({
  email,
  receiveFeedbackEmails,
  onFeedbackChange,
  title,
  feedbackLabel,
  className = ''
}: EmailSettingsSectionProps) => {
  return (
    <SettingSection title={title} className={className}>
      {/* Email Address */}
      <div className="flex items-center gap-3 py-3">
        <EnvelopeIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        <span className="text-sm text-gray-900 dark:text-gray-100">
          {email}
        </span>
      </div>

      {/* Feedback Emails Checkbox */}
      <div className="flex items-center gap-3 py-3">
        <input
          type="checkbox"
          id="feedback-emails"
          checked={receiveFeedbackEmails}
          onChange={(e) => onFeedbackChange(e.currentTarget.checked)}
          className="w-4 h-4 text-accent-500 bg-transparent border-gray-300 dark:border-gray-600 rounded focus:ring-accent-500 focus:ring-2"
        />
        <label htmlFor="feedback-emails" className="text-sm text-gray-900 dark:text-gray-100 cursor-pointer">
          {feedbackLabel}
        </label>
      </div>
    </SettingSection>
  );
};

