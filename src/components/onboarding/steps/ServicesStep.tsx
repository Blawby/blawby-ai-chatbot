/**
 * Services Step Component
 */

import { Input, Textarea } from '../../ui/input';
import { Button } from '../../ui/Button';
import { ValidationAlert } from '../atoms/ValidationAlert';
import { OnboardingActions } from '../molecules/OnboardingActions';

interface Service {
  id: string;
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
    const newService: Service = {
      id: `service-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: '',
      description: ''
    };
    onChange([...data, newService]);
  };

  const updateService = (id: string, field: keyof Omit<Service, 'id'>, value: string) => {
    const updated = data.map(service => 
      service.id === id 
        ? { ...service, [field]: value }
        : service
    );
    onChange(updated);
  };

  const removeService = (id: string) => {
    const updated = data.filter(service => service.id !== id);
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
            <p>No services added yet. Click &quot;Add Service&quot; to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.map((service, index) => (
              <div key={service.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                    Service {index + 1}
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeService(service.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    Remove
                  </Button>
                </div>
                
                <Input
                  label="Service Title"
                  value={service.title}
                  onChange={(value) => updateService(service.id, 'title', value)}
                  placeholder="e.g., Personal Injury Law"
                />
                
                <Textarea
                  label="Description (optional)"
                  value={service.description}
                  onChange={(value) => updateService(service.id, 'description', value)}
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