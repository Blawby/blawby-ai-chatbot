import { cn } from '@/shared/utils/cn';

export type DescribedRadioOption = { value: string; label: string; description?: string };

export interface RadioGroupWithDescriptionsProps {
  label: string;
  name: string;
  value: string;
  options: DescribedRadioOption[];
  onChange: (value: string) => void;
  className?: string;
}

export const RadioGroupWithDescriptions = ({
  label,
  name,
  value,
  options,
  onChange,
  className
}: RadioGroupWithDescriptionsProps) => (
  <fieldset className={className}>
    <legend className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">{label}</legend>
    <div className="-space-y-px rounded-md bg-white dark:bg-dark-card-bg">
      {options.map((option, index) => {
        const isSelected = value === option.value;
        const isFirst = index === 0;
        const isLast = index === options.length - 1;
        const inputId = `${name}-${option.value}`;
        return (
          <label
            key={option.value}
            htmlFor={inputId}
            aria-label={option.label}
            className={cn(
              'relative flex cursor-pointer items-start gap-3 border p-4 text-left transition focus-within:outline-none focus-within:ring-2 focus-within:ring-accent-500',
              isFirst && 'rounded-t-md',
              isLast && 'rounded-b-md',
              isSelected
                ? 'z-10 border-accent-200 bg-accent-50 text-gray-900 dark:border-accent-500/50 dark:bg-accent-500/10'
                : 'border-gray-200 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5'
            )}
          >
            <input
              id={inputId}
              type="radio"
              name={name}
              value={option.value}
              checked={isSelected}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <span
              className={cn(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                isSelected ? 'border-transparent bg-accent-500' : 'border-gray-300 bg-white dark:border-white/30 dark:bg-dark-card-bg'
              )}
              aria-hidden="true"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
            </span>
            <span className="flex flex-col">
              <span className={cn('block text-sm font-medium', isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-900 dark:text-gray-100')}>
                {option.label}
              </span>
              {option.description && (
                <span className={cn('block text-sm', isSelected ? 'text-accent-700 dark:text-accent-300' : 'text-gray-500 dark:text-gray-400')}>
                  {option.description}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  </fieldset>
);
