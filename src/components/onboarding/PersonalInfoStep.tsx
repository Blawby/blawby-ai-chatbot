import { useState, useRef, useEffect } from 'preact/hooks';
import { useTranslation, Trans } from '@/i18n/hooks';
import { Button } from '../ui/Button';
import { Logo } from '../ui/Logo';
import { UserIcon } from '@heroicons/react/24/outline';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, type FormData as FormDataType } from '../ui/form';
import { Input, DatePicker } from '../ui/input';
import { Checkbox } from '../ui/input';

interface PersonalInfoData {
  fullName: string;
  birthday?: string;
  agreedToTerms: boolean;
}


interface PersonalInfoStepProps {
  data: PersonalInfoData;
  onComplete: (data: PersonalInfoData) => void;
  onBack: () => void;
}

const PersonalInfoStep = ({ data: _data, onComplete, onBack }: PersonalInfoStepProps) => {
  const { t } = useTranslation('common');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleSubmit = async (formData: PersonalInfoData) => {
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    
    try {
      await onComplete(formData);
    } catch (error) {
      console.error('Error submitting personal info:', error);
    } finally {
      if (mountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };


  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-6">
          <Logo size="lg" />
        </div>
        
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
          {t('onboarding.step1.title')}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          {t('onboarding.step1.subtitle')}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-dark-card-bg py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <Form onSubmit={async (formData: FormDataType): Promise<void> => {
            const personalInfoData: PersonalInfoData = {
              fullName: (formData.fullName as string) || '',
              birthday: formData.birthday as string | undefined,
              agreedToTerms: Boolean(formData.agreedToTerms)
            };
            await handleSubmit(personalInfoData);
          }} initialData={_data as unknown as FormDataType}>
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
                        format="date"
                        max={new Date().toISOString().split('T')[0]} // Prevent future dates
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
                            termsLink: <a href="/terms" className="text-accent-600 dark:text-accent-400 hover:text-accent-500 dark:hover:text-accent-300 underline" aria-label="Terms of Service">Terms</a>,
                            privacyLink: <a href="/privacy" className="text-accent-600 dark:text-accent-400 hover:text-accent-500 dark:hover:text-accent-300 underline" aria-label="Privacy Policy">Privacy Policy</a>
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
                disabled={isSubmitting}
                variant="primary"
                size="lg"
                className="w-full"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  t('onboarding.step1.continue')
                )}
              </Button>
              
              <Button
                type="button"
                onClick={onBack}
                variant="secondary"
                size="lg"
                className="w-full"
              >
                {t('onboarding.step1.back')}
              </Button>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default PersonalInfoStep;
