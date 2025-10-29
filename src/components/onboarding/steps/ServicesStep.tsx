/**
 * Services Step Component
 */

import { Input, Textarea } from '../../ui/input';
import { Button } from '../../ui/Button';
import { ValidationAlert } from '../atoms/ValidationAlert';
import { OnboardingActions } from '../molecules/OnboardingActions';

interface Service {
  title: string;
  description: string;
}

interface ServicesStepProps {
  data: Service[];
  onChange: (services: Service[]) => void;
  onContinue: () => void;
  onBack: () => void;
  errors?: string | null;
}

export function ServicesStep({ data, onChange, onContinue, onBack, errors }: ServicesStepProps) {
  const addService = () => {
    onChange([...data, { title: '', description: '' }]);
  };

  const updateService = (index: number, field: keyof Service, value: string) => {
    const updated = [...data];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const removeService = (index: number) => {
    const updated = data.filter((_, i) => i !== index);
    onChange(updated);
  };

  return (
    <div className="space-y-6">
      {errors && (
        <ValidationAlert type="error">
          {errors}
        </ValidationAlert>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Practice Areas & Services
          </h3>
          <Button
            variant="secondary"
            size="sm"
            onClick={addService}
          >
            Add Service
          </Button>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400">
          Add the legal services you offer. This helps the AI assistant provide more relevant guidance to potential clients.
        </p>

        {data.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <p>No services added yet. Click "Add Service" to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.map((service, index) => (
              <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                    Service {index + 1}
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeService(index)}
                    className="text-red-600 hover:text-red-700"
                  >
                    Remove
                  </Button>
                </div>
                
                <Input
                  label="Service Title"
                  value={service.title}
                  onChange={(value) => updateService(index, 'title', value)}
                  placeholder="e.g., Personal Injury Law"
                />
                
                <Textarea
                  label="Description (optional)"
                  value={service.description}
                  onChange={(value) => updateService(index, 'description', value)}
                  placeholder="Brief description of this service..."
                  rows={2}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <OnboardingActions
        onContinue={onContinue}
        onBack={onBack}
      />
    </div>
  );
}