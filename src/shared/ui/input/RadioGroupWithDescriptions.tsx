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
    <legend className="block text-sm font-medium text-input-text mb-1">{label}</legend>
    <div className="-space-y-px overflow-hidden rounded-2xl border border-line-glass/30 bg-surface-overlay/55 backdrop-blur-xl">
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
                ? 'z-10 border-accent-500/45 bg-accent-500/10 text-[rgb(var(--accent-foreground))]'
                : 'border-line-glass/25 bg-transparent hover:bg-surface-glass/35'
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
                isSelected ? 'border-transparent bg-accent-500' : 'border-line-glass/30 bg-surface-glass/60'
              )}
              aria-hidden="true"
            >
            <span className="h-1.5 w-1.5 rounded-full bg-input-bg" />
            </span>
            <span className="flex flex-col">
              <span className={cn('block text-sm font-medium', isSelected ? 'text-inherit' : 'text-input-text')}>
                {option.label}
              </span>
              {option.description && (
                <span className={cn('block text-sm', isSelected ? 'text-inherit opacity-85' : 'text-input-placeholder')}>
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
