import { useState } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import { Button } from '@/shared/ui/Button';
import { Logo } from '@/shared/ui/Logo';
import {
  ChatBubbleLeftRightIcon,
  BanknotesIcon,
  ClipboardDocumentListIcon,
  ClipboardDocumentCheckIcon,
  EllipsisHorizontalIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/shared/ui/form';
import { Textarea } from '@/shared/ui/input';

interface UseCaseData {
  primaryUseCase: 'messaging' | 'legal_payments' | 'matter_management' | 'intake_forms' | 'other';
  productUsage: Array<'messaging' | 'legal_payments' | 'matter_management' | 'intake_forms' | 'other'>;
  additionalInfo?: string;
}

interface UseCaseStepProps {
  data: UseCaseData;
  onComplete: (data: UseCaseData) => void;
}

const useCaseOptions = [
  {
    id: 'messaging' as const,
    icon: ChatBubbleLeftRightIcon,
    labelKey: 'onboarding.step2.options.messaging'
  },
  {
    id: 'legal_payments' as const,
    icon: BanknotesIcon,
    labelKey: 'onboarding.step2.options.legal_payments'
  },
  {
    id: 'matter_management' as const,
    icon: ClipboardDocumentListIcon,
    labelKey: 'onboarding.step2.options.matter_management'
  },
  {
    id: 'intake_forms' as const,
    icon: ClipboardDocumentCheckIcon,
    labelKey: 'onboarding.step2.options.intake_forms'
  },
  {
    id: 'other' as const,
    icon: EllipsisHorizontalIcon,
    labelKey: 'onboarding.step2.options.other'
  }
];

const UseCaseStep = ({ data, onComplete }: UseCaseStepProps) => {
  const { t } = useTranslation('common');
  const [selectedUseCases, setSelectedUseCases] = useState<UseCaseData['productUsage']>(
    data.productUsage?.length ? data.productUsage : [data.primaryUseCase]
  );
  const [additionalInfo, setAdditionalInfo] = useState(data.additionalInfo || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasSelection = selectedUseCases.length > 0;

  const resolvePrimaryUseCase = (values: UseCaseData['productUsage']): UseCaseData['primaryUseCase'] => {
    const order: UseCaseData['primaryUseCase'][] = [
      'messaging',
      'legal_payments',
      'matter_management',
      'intake_forms',
      'other'
    ];
    const found = order.find((value) => values.includes(value));
    return found ?? 'other';
  };

  const handleSubmit = async () => {
    if (!hasSelection) return;
    setIsSubmitting(true);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    onComplete({
      primaryUseCase: resolvePrimaryUseCase(selectedUseCases),
      productUsage: selectedUseCases,
      additionalInfo: selectedUseCases.includes('other') && additionalInfo.trim() ? additionalInfo.trim() : undefined
    });
    
    setIsSubmitting(false);
  };

  const handleUseCaseSelect = (useCase: UseCaseData['primaryUseCase']) => {
    setSelectedUseCases((prev) => {
      if (prev.includes(useCase)) {
        const next = prev.filter((value) => value !== useCase);
        if (useCase === 'other') {
          setAdditionalInfo('');
        }
        return next;
      }
      return [...prev, useCase];
    });
  };

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg flex flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex justify-center mb-6">
          <Logo size="lg" />
        </div>
        <h2 id="use-case-title" className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
          {t('onboarding.step2.title')}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          {t('onboarding.step2.subtitle')}
        </p>
      </div>

      <div className="mt-8 mx-auto w-full max-w-2xl">
        <div className="bg-white dark:bg-dark-card-bg py-8 px-6 shadow sm:rounded-lg sm:px-10">
          <Form onSubmit={handleSubmit} className="space-y-6">
            {/* Use Case Options */}
            <div
              role="group"
              aria-labelledby="use-case-title"
              className="grid gap-3 sm:grid-cols-2"
            >
              {useCaseOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = selectedUseCases.includes(option.id);

                return (
                  <button
                    key={option.id}
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    onClick={() => handleUseCaseSelect(option.id)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all duration-200 ${
                      isSelected
                        ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <Icon className={`h-6 w-6 ${
                          isSelected 
                            ? 'text-accent-600 dark:text-accent-400' 
                            : 'text-gray-400 dark:text-gray-500'
                        }`} />
                        <span className={`text-sm font-medium ${
                          isSelected 
                            ? 'text-accent-600 dark:text-accent-400' 
                            : 'text-gray-900 dark:text-white'
                        }`}>
                          {t(option.labelKey)}
                        </span>
                      </div>
                      {isSelected && (
                        <CheckIcon className="h-5 w-5 text-accent-600 dark:text-accent-400" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Additional Info for "Other" option */}
            {selectedUseCases.includes('other') && (
              <FormField name="additionalInfo">
                {({ value, error, onChange }) => (
                  <FormItem>
                    <FormLabel>{t('onboarding.step2.otherPlaceholder')}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        value={additionalInfo}
                        onChange={(value) => {
                          const nextValue = String(value ?? '');
                          onChange(nextValue);
                          setAdditionalInfo(nextValue);
                        }}
                        placeholder={t('onboarding.step2.otherPlaceholder')}
                        error={error?.message}
                      />
                    </FormControl>
                    {error && <FormMessage>{error.message}</FormMessage>}
                  </FormItem>
                )}
              </FormField>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col space-y-3">
              <Button
                type="submit"
                disabled={isSubmitting || !hasSelection}
                variant="primary"
                size="lg"
                className="w-full"
              >
                {isSubmitting ? (
                  <div className="flex items-center justify-center space-x-2" aria-live="polite" role="status">
                    <div 
                      className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" 
                      aria-label="Submitting"
                    />
                    <span className="sr-only">Submitting...</span>
                  </div>
                ) : (
                  t('onboarding.step2.next')
                )}
              </Button>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default UseCaseStep;
