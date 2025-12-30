/**
 * FeatureList - Molecule Component
 * 
 * List of FeatureBullet components.
 * Handles feature list layout and styling.
 */

import { FeatureBullet } from './FeatureBullet';
import { cn } from '@/shared/utils/cn';
import type { ComponentChildren } from 'preact';

export interface FeatureItem {
  text: string;
  icon?: ComponentChildren;
  variant?: 'default' | 'success' | 'warning' | 'info';
}

interface FeatureListProps {
  items: FeatureItem[];
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const FeatureList = ({
  items,
  size = 'md',
  className = ''
}: FeatureListProps) => {
  const spacingBySize = {
    sm: 'space-y-2',
    md: 'space-y-3',
    lg: 'space-y-4'
  } as const;
  return (
    <ul className={cn(spacingBySize[size] || 'space-y-3', className)}>
      {items.map((item, index) => (
        <FeatureBullet
          key={index}
          icon={item.icon}
          variant={item.variant}
          size={size}
        >
          {item.text}
        </FeatureBullet>
      ))}
    </ul>
  );
};
