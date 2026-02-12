import type { ComponentChildren, ComponentType, JSX } from 'preact';
import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';

export interface PlanFeature {
  // Allow either a JSX node or a component that accepts className
  icon: ComponentChildren | ComponentType<JSX.SVGAttributes<SVGSVGElement>>;
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
          <div className="text-input-placeholder">
            {typeof feature.icon === 'function'
              ? <Icon icon={feature.icon as ComponentType<JSX.SVGAttributes<SVGSVGElement>>} className="w-5 h-5" />
              : feature.icon}
          </div>
          <span className="text-sm text-input-text">
            {feature.text}
          </span>
        </div>
      ))}
    </div>
  );
};
