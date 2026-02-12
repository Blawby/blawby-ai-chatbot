import { useState, useRef, useEffect } from 'preact/hooks';
import { useTranslation, Trans } from '@/shared/i18n/hooks';
import { Button } from '@/shared/ui/Button';
import { Logo } from '@/shared/ui/Logo';
import { UserIcon } from '@heroicons/react/24/outline';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, type FormData } from '@/shared/ui/form';
import { DatePicker, Checkbox, Input } from '@/shared/ui/input';
import { schemas } from '@/shared/ui/validation/schemas';

interface PersonalInfoData extends FormData {
  fullName: string;
  birthday?: string;
  agreedToTerms: boolean;
}


interface PersonalInfoStepProps {
  data: PersonalInfoData;
  onComplete: (data: PersonalInfoData) => void;
  isSubmitting?: boolean;
}

const PersonalInfoStep = ({ data: _data, onComplete, isSubmitting: parentSubmitting = false }: PersonalInfoStepProps) => {
  const { t } = useTranslation('common');
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleSubmit = async (formData: PersonalInfoData) => {
    if (parentSubmitting || localSubmitting) return;
    
    setLocalSubmitting(true);
    
    try {
      await onComplete(formData);
    } catch (error) {
      console.error('Error submitting personal info:', error);
    } finally {
      if (mountedRef.current) {
        setLocalSubmitting(false);
      }
    }
  };


  return (
    <div className="min-h-screen bg-surface-base flex flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mx-auto w-full max-w-md">
        <div className="flex justify-center mb-6">
          <Logo size="lg" />
        </div>

        <h2 className="mt-6 text-center text-3xl font-extrabold text-input-text">
          {t('onboarding.step1.title')}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          {t('onboarding.step1.subtitle')}
        </p>
      </div>

      <div className="mt-8 mx-auto w-full max-w-md">
        <div className="glass-panel py-8 px-6 sm:rounded-lg sm:px-10">
          <Form<PersonalInfoData> 
            onSubmit={async (formData: PersonalInfoData): Promise<void> => {
              await handleSubmit(formData);
            }} 
            initialData={_data}
            schema={schemas.onboarding.personalInfo}
          >
            <div className="space-y-4">
              {/* Full Name */}
              <FormField name="fullName">
                {({ value, error, onChange }) => (
                  <FormItem>
                    <FormLabel>{t('onboarding.step1.fullName')}</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        required
                        value={(value as string) || ''}
                        onChange={(value) => onChange(value)}
                        placeholder={t('onboarding.step1.fullNamePlaceholder')}
                        icon={<UserIcon className="h-5 w-5 text-gray-400" />}
                        error={error?.message}
                      />
                    </FormControl>
                    {error && (
                      <FormMessage>{error.message}</FormMessage>
                    )}
                  </FormItem>
                )}
              </FormField>

              {/* Birthday */}
              <FormField name="birthday">
                {({ value, error, onChange }) => (
                  <FormItem>
                    <FormLabel>{t('onboarding.step1.birthday')}</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={(value as string) || ''}
                        onChange={(date) => onChange(date as string)}
                        placeholder={t('onboarding.step1.birthdayPlaceholder')}
                        isBirthday
                        format="date"
                        max={new Date().toISOString().split('T')[0]} // Prevent future dates
                        required
                        error={error?.message}
                      />
                    </FormControl>
                    {error && (
                      <FormMessage>{error.message}</FormMessage>
                    )}
                  </FormItem>
                )}
              </FormField>

            </div>

            {/* Terms Agreement */}
            <FormField name="agreedToTerms">
              {({ value, error, onChange }) => (
                <FormItem>
                  <FormControl>
                    <Checkbox
                      id="agreedToTerms"
                      checked={(value as boolean) || false}
                      onChange={(checked) => onChange(checked)}
                      label={
                        <Trans
                          i18nKey="onboarding.step1.termsAgreement"
                          components={{
                            termsLink: <a href="https://blawby.com/terms" className="text-accent-600 dark:text-accent-400 hover:text-accent-500 dark:hover:text-accent-300 underline" aria-label="Terms of Service" target="_blank" rel="noopener noreferrer">Terms</a>,
                            privacyLink: <a href="https://blawby.com/privacy" className="text-accent-600 dark:text-accent-400 hover:text-accent-500 dark:hover:text-accent-300 underline" aria-label="Privacy Policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
                          }}
                        />
                      }
                      error={error?.message}
                    />
                  </FormControl>
                  {error && (
                    <FormMessage>{error.message}</FormMessage>
                  )}
                </FormItem>
              )}
            </FormField>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button
                type="submit"
                disabled={parentSubmitting || localSubmitting}
                variant="primary"
                size="lg"
                className="w-full"
              >
                {(parentSubmitting || localSubmitting) ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  t('onboarding.step1.continue')
                )}
              </Button>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default PersonalInfoStep;
