/**
 * Services Step Component
 */

import { ServicesEditor } from '@/features/services/components/ServicesEditor';
import type { Service } from '@/features/services/types';

interface ServicesStepProps {
  data: Service[];
  onChange: (services: Service[]) => void;
}

export function ServicesStep({ data, onChange }: ServicesStepProps) {
  return <ServicesEditor services={data} onChange={onChange} />;
}
