import { forwardRef } from 'preact/compat';
import { useRef } from 'preact/hooks';
import { useUniqueId } from '@/shared/hooks/useUniqueId';
import { cn } from '@/shared/utils/cn';

export interface LogoUploadInputProps {
  imageUrl?: string | null;
  name?: string;
  label?: string;
  description?: string;
  buttonLabel?: string;
  accept?: string;
  disabled?: boolean;
  multiple?: boolean;
  required?: boolean;
  className?: string;
  size?: number;
  progress?: number | null;
  onChange?: (files: FileList | File[]) => void;
}

export const LogoUploadInput = forwardRef<HTMLInputElement, LogoUploadInputProps>(({
  imageUrl,
  name,
  label,
  description,
  buttonLabel = 'Change',
  accept = 'image/*',
  disabled = false,
  multiple = false,
  required = false,
  className,
  size = 48,
  progress = null,
  onChange
}, ref) => {
  const internalRef = useRef<HTMLInputElement | null>(null);
  const inputId = useUniqueId('logo-upload');
  const hasImage = typeof imageUrl === 'string' && imageUrl.trim().length > 0;

  const initials = (() => {
    if (!name || typeof name !== 'string') return '';
    const trimmed = name.trim();
    if (!trimmed) return '';
    return trimmed
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase())
      .join('')
      .slice(0, 2);
  })();

  const handleFileChange = (event: Event) => {
    const target = event.target as HTMLInputElement;
    const files = target.files;
    if (files) {
      onChange?.(Array.from(files));
      target.value = '';
    }
  };

  const handleButtonClick = () => {
    if (disabled) return;
    internalRef.current?.click();
  };

  const setInputRef = (node: HTMLInputElement | null) => {
    internalRef.current = node;
    if (typeof ref === 'function') {
      ref(node);
    } else if (ref) {
      ref.current = node;
    }
  };

  const normalizedProgress = typeof progress === 'number'
    ? Math.min(Math.max(progress, 0), 100)
    : null;
  const ringSize = size + 8;
  const ringRadius = (ringSize / 2) - 2;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = normalizedProgress === null
    ? ringCircumference
    : ringCircumference - (normalizedProgress / 100) * ringCircumference;

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-900 dark:text-gray-100">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
      )}
      {description && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {description}
        </p>
      )}
      <div className="mt-2 flex items-center gap-x-3">
        <div
          className="relative shrink-0"
          style={{ width: ringSize, height: ringSize }}
        >
        {normalizedProgress !== null && (
          <svg
            className="absolute inset-0"
            viewBox={`0 0 ${ringSize} ${ringSize}`}
            aria-hidden="true"
          >
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={ringRadius}
              className="text-accent-500 transition-[stroke-dashoffset] duration-200 ease-out"
              stroke="currentColor"
              strokeWidth="3"
              fill="transparent"
              strokeDasharray={ringCircumference}
              strokeDashoffset={ringOffset}
              strokeLinecap="round"
            />
          </svg>
        )}
        <div
          className="absolute inset-1 overflow-hidden rounded-full border border-gray-200 bg-gray-100 dark:border-dark-border dark:bg-gray-800"
          style={{ width: size, height: size, left: 4, top: 4 }}
        >
        {hasImage ? (
          <img
            src={imageUrl ?? ''}
            alt={name ? `${name} logo` : 'Practice logo'}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-xs font-semibold text-gray-400 dark:text-gray-500">
              {initials || 'Logo'}
            </span>
          </div>
        )}
        </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleButtonClick}
            disabled={disabled}
            className="rounded-full bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 transition hover:bg-gray-50 disabled:cursor-not-allowed dark:bg-white/10 dark:text-white dark:shadow-none dark:ring-white/10 dark:hover:bg-white/20"
          >
            {buttonLabel}
          </button>
          <input
            ref={setInputRef}
            id={inputId}
            type="file"
            accept={accept}
            multiple={multiple}
            disabled={disabled}
            required={required}
            onChange={handleFileChange}
            className="sr-only"
          />
        </div>
      </div>
    </div>
  );
});
