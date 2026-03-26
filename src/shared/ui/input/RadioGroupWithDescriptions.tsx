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
    <legend className="mb-1 block text-sm font-medium text-input-text">{label}</legend>
    <div className="glass-card overflow-hidden rounded-2xl">
      {options.map((option, index) => {
        const isSelected = value === option.value;
        const isFirst = index === 0;
        const inputId = `${name}-${option.value}`;
        return (
          <label
            key={option.value}
            htmlFor={inputId}
            aria-label={option.label}
            className={cn(
              'relative flex cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors',
              !isFirst && 'border-t border-line-glass/20',
              'focus-within:outline-none focus-within:ring-2 focus-within:ring-accent-500/50 focus-within:ring-inset',
              isSelected
                ? 'bg-white/[0.10] ring-1 ring-inset ring-accent-500/45 text-input-text'
                : 'text-input-text hover:bg-white/[0.04]'
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
                isSelected
                  ? 'border-accent-500/50 bg-accent-500/20'
                  : 'border-line-glass/40 bg-white/[0.10]'
              )}
              aria-hidden="true"
            >
              {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />}
            </span>
            <span className="flex flex-col">
              <span className="block text-sm font-medium text-input-text">
                {option.label}
              </span>
              {option.description && (
                <span className="block text-xs text-input-placeholder">
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
