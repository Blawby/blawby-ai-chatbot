import { AIRibbon } from '@/design-system/patterns';

export interface SettingsAIPrefaceProps {
  /**
   * Optional override for the body copy. Defaults to the standard
   * Settings.html voice — short, single line, no chips.
   */
  body?: string;
  className?: string;
}

/**
 * Settings AI preface strip.
 *
 * Renders the standard "I'm here so you can see and audit the rules I follow"
 * observation ribbon used at the top of AI-relevant settings pages
 * (Intelligence, and any other surface that exposes assistant behavior).
 *
 * Wraps `AIRibbon` so all settings pages share the exact same copy + visual
 * treatment; pages should NOT inline their own AIRibbon for this purpose.
 */
const DEFAULT_BODY =
  "I'm here so you can see and audit the rules I follow. Every write I propose is staged for your approval — never automatic.";

export function SettingsAIPreface({ body = DEFAULT_BODY, className }: SettingsAIPrefaceProps) {
  return (
    <AIRibbon
      variant="observation"
      body={body}
      className={className}
    />
  );
}

export default SettingsAIPreface;
