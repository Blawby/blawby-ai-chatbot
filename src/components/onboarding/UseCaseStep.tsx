import { useState } from 'preact/hooks';
import { useTranslation } from '@/i18n/hooks';
import { Button } from '../ui/Button';
import { Logo } from '../ui/Logo';
import { 
  ScaleIcon, 
  BriefcaseIcon, 
  MagnifyingGlassIcon, 
  DocumentIcon, 
  EllipsisHorizontalIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '../ui/form';
import { Textarea } from '../ui/input';

interface UseCaseData {
  selectedUseCases: ('personal' | 'business' | 'research' | 'documents' | 'other')[];
  additionalInfo?: string;
}

interface UseCaseStepProps {
  data: UseCaseData;
  onComplete: (data: UseCaseData) => void;
  onSkip: () => void;
}

const useCaseOptions = [
  {
    id: 'personal' as const,
    icon: ScaleIcon,
    labelKey: 'onboarding.step2.options.personal'
  },
  {
    id: 'business' as const,
    icon: BriefcaseIcon,
    labelKey: 'onboarding.step2.options.business'
  },
  {
    id: 'research' as const,
    icon: MagnifyingGlassIcon,
    labelKey: 'onboarding.step2.options.research'
  },
  {
    id: 'documents' as const,
    icon: DocumentIcon,
    labelKey: 'onboarding.step2.options.documents'
  },
  {
    id: 'other' as const,
    icon: EllipsisHorizontalIcon,
    labelKey: 'onboarding.step2.options.other'
  }
];

const UseCaseStep = ({ data, onComplete, onSkip }: UseCaseStepProps) => {
  const { t } = useTranslation('common');
  const [selectedUseCases, setSelectedUseCases] = useState<UseCaseData['selectedUseCases']>(data.selectedUseCases || []);
  const [additionalInfo, setAdditionalInfo] = useState(data.additionalInfo || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    onComplete({
      selectedUseCases: selectedUseCases,
      additionalInfo: selectedUseCases.includes('other') && additionalInfo.trim() ? additionalInfo.trim() : undefined
    });
    
    setIsSubmitting(false);
  };

  const handleUseCaseToggle = (useCase: 'personal' | 'business' | 'research' | 'documents' | 'other') => {
    setSelectedUseCases(prev => {
      if (prev.includes(useCase)) {
        // Remove from selection
        const newSelection = prev.filter(item => item !== useCase);
        // Clear additional info if "other" is deselected
        if (useCase === 'other') {
          setAdditionalInfo('');
        }
        return newSelection;
      } else {
        // Add to selection
        return [...prev, useCase];
      }
    });
  };

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
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

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="bg-white dark:bg-dark-card-bg py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <Form onSubmit={handleSubmit} className="space-y-6">
            {/* Use Case Options */}
            <div role="group" aria-labelledby="use-case-title" className="space-y-3">
              {useCaseOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = selectedUseCases.includes(option.id);
                
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    onClick={() => handleUseCaseToggle(option.id)}
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
                        value={(value as string) || ''}
                        onChange={(value) => onChange(value)}
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
                disabled={isSubmitting}
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
              
              <button
                type="button"
                onClick={onSkip}
                className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                {t('onboarding.step2.skip')}
              </button>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default UseCaseStep;
