import { useEffect, useRef, useState } from 'preact/hooks';
import { ChevronUpDownIcon } from '@heroicons/react/24/outline';

export type MultiSelectOption = { value: string; label: string; meta?: string };

export interface MultiSelectProps {
  label: string;
  placeholder: string;
  value: string[];
  options: MultiSelectOption[];
  onChange: (value: string[]) => void;
}

export const MultiSelect = ({
  label,
  placeholder,
  value,
  options,
  onChange
}: MultiSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedOptions = options.filter((option) => value.includes(option.value));

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const toggleValue = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((item) => item !== optionValue));
      return;
    }
    onChange([...value, optionValue]);
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-md border border-gray-300 dark:border-white/10 bg-white dark:bg-dark-input-bg px-3 py-3 text-left text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
      >
        {selectedOptions.length === 0 ? (
          <span className="text-gray-400 dark:text-gray-500">{placeholder}</span>
        ) : (
          <span className="flex flex-wrap gap-2">
            {selectedOptions.map((option) => (
              <span
                key={option.value}
                className="inline-flex items-center rounded-full bg-gray-100 dark:bg-white/10 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-200"
              >
                {option.label}
              </span>
            ))}
          </span>
        )}
        <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="absolute z-40 mt-2 w-full rounded-md border border-gray-200 dark:border-white/10 bg-white dark:bg-dark-card-bg shadow-lg">
          <div className="max-h-60 overflow-auto p-2">
            {options.map((option) => {
              const checked = value.includes(option.value);
              return (
                <label
                  key={option.value}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleValue(option.value)}
                    className="h-4 w-4 rounded border-gray-300 text-accent-600 focus:ring-accent-500"
                  />
                  <span className="flex-1">
                    {option.label}
                    {option.meta && (
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{option.meta}</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
