import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';
import { TrendingUp, TrendingDown, Minus } from 'lucide-preact';

export interface StatCardProps {
  label: string;
  value: string | number;
  trend?: { value: string | number; direction: 'up' | 'down' | 'neutral' };
  icon?: ComponentChildren;
  className?: string;
}

export function StatCard({ label, value, trend, icon, className }: StatCardProps) {
  const TrendIcon = trend?.direction === 'up' ? TrendingUp : trend?.direction === 'down' ? TrendingDown : Minus;
  const trendColor = trend?.direction === 'up'
    ? 'text-emerald-500'
    : trend?.direction === 'down'
      ? 'text-red-500'
      : 'text-input-placeholder';

  return (
    <div className={cn('glass-panel p-4 rounded-2xl', className)}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs text-input-placeholder">{label}</span>
        {icon && <span className="text-input-placeholder/60">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold text-input-text tabular-nums">{value}</div>
      {trend && (
        <div className={cn('flex items-center gap-1 mt-1.5', trendColor)}>
          <TrendIcon size={13} />
          <span className="text-xs font-medium">{trend.value}</span>
        </div>
      )}
    </div>
  );
}
