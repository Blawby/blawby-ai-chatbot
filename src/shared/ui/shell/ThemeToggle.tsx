import { useCallback } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';
import { Moon, Sun } from 'lucide-preact';

export interface ThemeToggleProps {
  isDark: boolean;
  onToggle: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'btn-icon-xs',
  md: 'btn-icon-sm',
  lg: 'btn-icon-md',
};

const iconSize = { sm: 14, md: 16, lg: 18 };

export function ThemeToggle({ isDark, onToggle, size = 'md', className }: ThemeToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn('btn btn-ghost', sizeMap[size], className)}
    >
      {isDark ? <Sun size={iconSize[size]} /> : <Moon size={iconSize[size]} />}
    </button>
  );
}
