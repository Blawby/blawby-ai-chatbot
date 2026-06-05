import { Trans } from '@/shared/i18n/hooks';
import { User } from 'lucide-preact';
import { Input, DatePicker, Checkbox } from '@/shared/ui/input';
import type { OnboardingDraft } from '../types';

interface AboutYouStepProps {
  draft: OnboardingDraft;
  /** Whether the session lacks a name (must require name collection). */
  requireName: boolean;
  onChange: (patch: Partial<OnboardingDraft>) => void;
}

/**
 * Step 1 body — collects the user's name (if missing from session), birthday,
 * and terms agreement. The card shape matches the canonical `.form-card`.
 */
export const AboutYouStep = ({ draft, requireName, onChange }: AboutYouStepProps) => {
  const today = new Date().toISOString().split('T')[0];

  return (
    <section
      className="card"
      style={{ padding: '28px' }}
    >
      <h2
        style={{
          fontFamily: 'var(--serif)',
          fontWeight: 400,
          fontSize: '28px',
          lineHeight: 1.15,
          letterSpacing: '-0.01em',
          margin: '0 0 18px',
          color: 'var(--ink)'
        }}
      >
        About you
      </h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {requireName && (
          <div className="md:col-span-2">
            <label className="label mb-1.5 block" htmlFor="onboarding-fullName">
              Full name
            </label>
            <Input
              id="onboarding-fullName"
              type="text"
              required
              value={draft.fullName ?? ''}
              onChange={(value) => onChange({ fullName: value })}
              placeholder="Jane Doe"
              icon={User}
              iconClassName="h-5 w-5 text-dim-2"
            />
          </div>
        )}

        <div className={requireName ? '' : 'md:col-span-2'}>
          <label className="label mb-1.5 block" htmlFor="onboarding-birthday">
            Birthday
          </label>
          <DatePicker
            value={draft.birthday ?? ''}
            onChange={(date) => onChange({ birthday: typeof date === 'string' ? date : '' })}
            placeholder="MM/DD/YYYY"
            isBirthday
            format="date"
            max={today}
            required
          />
        </div>
      </div>

      <div className="mt-6">
        <Checkbox
          id="onboarding-terms"
          checked={Boolean(draft.agreedToTerms)}
          onChange={(checked) => onChange({ agreedToTerms: checked })}
          label={
            <Trans
              i18nKey="onboarding.step1.termsAgreement"
              ns="common"
              components={{
                termsLink: (
                  <a
                    href="https://blawby.com/terms"
                    className="text-accent dark:text-accent hover:text-accent-deep dark:hover:text-accent-deep underline"
                    aria-label="Terms of Service"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Terms
                  </a>
                ),
                privacyLink: (
                  <a
                    href="https://blawby.com/privacy"
                    className="text-accent dark:text-accent hover:text-accent-deep dark:hover:text-accent-deep underline"
                    aria-label="Privacy Policy"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Privacy Policy
                  </a>
                )
              }}
            />
          }
        />
      </div>
    </section>
  );
};

/**
 * Step 1 validation — name (if required), birthday, and terms must all be set.
 */
export const isAboutYouComplete = (draft: OnboardingDraft, requireName: boolean): boolean => {
  if (requireName && (draft.fullName ?? '').trim().length < 2) return false;
  if (!draft.birthday || draft.birthday.trim().length === 0) return false;
  if (!draft.agreedToTerms) return false;
  return true;
};

export default AboutYouStep;
