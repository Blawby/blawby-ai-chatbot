/**
 * Services Step Component
 * Configure the services offered by the business
 */

import { useState } from 'preact/hooks';
import { useTranslation } from '@/i18n/hooks';
import { Button } from '../../ui/Button';
import { Input, Textarea } from '../../ui/input';
import { XMarkIcon, PlusIcon } from '@heroicons/react/24/outline';

interface Service {
  id: string;
  title: string;
  description: string;
}

interface ServicesStepProps {
  data: {
    services: Service[];
  };
  onChange: (data: any) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function ServicesStep({ data, onChange, onContinue, onBack }: ServicesStepProps) {
  const { t } = useTranslation('onboarding');
  const [errors, setErrors] = useState<string[]>([]);

  const handleAddService = () => {
    const newService: Service = {
      id: Math.random().toString(36).substr(2, 9),
      title: '',
      description: ''
    };
    onChange({
      ...data,
      services: [...data.services, newService]
    });
  };

  const handleRemoveService = (index: number) => {
    const services = data.services.filter((_, i) => i !== index);
    onChange({
      ...data,
      services: services
    });
  };

  const handleServiceChange = (index: number, field: 'title' | 'description', value: string) => {
    const services = [...data.services];
    services[index] = { ...services[index], [field]: value };
    onChange({
      ...data,
      services: services
    });
  };

  const handleContinue = () => {
    const validServices = data.services.filter(service => service.title.trim().length > 0);
    
    if (validServices.length === 0) {
      setErrors(['At least one service is required']);
      return;
    }

    setErrors([]);
    onContinue();
  };

  return (
    <div className="space-y-6">
      {errors.length > 0 && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
          <ul className="space-y-1 text-sm text-red-700 dark:text-red-300">
            {errors.map((error, i) => (
              <li key={i}>• {error}</li>
            ))}
          </ul>
        </div>
      )}

      {data.services.length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No services added yet. Click "Add Service" to get started.
        </div>
      )}

      <div className="space-y-4">
        {data.services.map((service, index) => (
          <div key={service.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
            <div className="flex justify-between items-start">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                Service {index + 1}
              </h4>
              <button
                onClick={() => handleRemoveService(index)}
                className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                type="button"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            
            <Input
              label="Service title"
              value={service.title}
              onChange={(value) => handleServiceChange(index, 'title', value)}
              placeholder="e.g., Family Law Consultation"
              required
            />
            
            <Textarea
              label="Description (optional)"
              value={service.description || ''}
              onChange={(value) => handleServiceChange(index, 'description', value)}
              placeholder="Brief description of this service"
              rows={2}
            />
          </div>
        ))}
      </div>

      <Button
        variant="secondary"
        onClick={handleAddService}
        className="w-full"
      >
        <PlusIcon className="w-5 h-5 mr-2" />
        Add Service
      </Button>

      <div className="flex gap-3 pt-4">
        <Button variant="secondary" onClick={onBack} className="flex-1">
          Back
        </Button>
        <Button variant="primary" onClick={handleContinue} className="flex-1">
          Continue
        </Button>
      </div>
    </div>
  );
}