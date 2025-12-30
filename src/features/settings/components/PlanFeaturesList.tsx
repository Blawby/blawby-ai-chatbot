import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface PlanFeature {
  // Allow either a JSX node or a component that accepts className
  icon: ComponentChildren | preact.ComponentType<{ className?: string }>;
  text: string;
}

export interface PlanFeaturesListProps {
  features: PlanFeature[];
  className?: string;
}

export const PlanFeaturesList = ({
  features,
  className = ''
}: PlanFeaturesListProps) => {
  return (
    <div className={cn('space-y-2', className)}>
      {features.map((feature, index) => (
        <div key={index} className="flex items-center gap-3">
          <div className="text-gray-500 dark:text-gray-400">
            {typeof feature.icon === 'function'
              ? (() => {
                  const Icon = feature.icon as preact.ComponentType<{ className?: string }>;
                  return <Icon className="w-5 h-5 flex-shrink-0" />;
                })()
              : feature.icon}
          </div>
          <span className="text-sm text-gray-900 dark:text-gray-100">
            {feature.text}
          </span>
        </div>
      ))}
    </div>
  );
};
