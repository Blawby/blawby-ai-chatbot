import { twMerge } from 'tailwind-merge';

// Utility function for className merging (following codebase pattern)
export function cn(...classes: (string | undefined | null | false)[]): string {
  return twMerge(classes.filter(Boolean).join(' '));
}
