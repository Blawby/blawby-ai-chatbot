import { forwardRef, useState, useCallback } from 'preact/compat';
import { cn } from '@/shared/utils/cn';
import { formatFileSize } from '@/shared/utils/mediaAggregation';
import { useUniqueId } from '@/shared/hooks/useUniqueId';

/**
 * FileInput Component
 * 
 * @deprecated maxSize prop is deprecated. Use maxFileSize and maxTotalSize instead.
 * 
 * Migration guide:
 * - Replace maxSize with maxFileSize for per-file size limits
 * - Replace maxSize with maxTotalSize for total size limits across all files
 * - If you were using maxSize for both per-file and total limits, you can now set different values:
 *   - maxFileSize: maximum size for individual files
 *   - maxTotalSize: maximum total size for all files combined
 * 
 * Example migration:
 * Before: <FileInput maxSize={10 * 1024 * 1024} /> // 10MB for both per-file and total
 * After:  <FileInput maxFileSize={5 * 1024 * 1024} maxTotalSize={10 * 1024 * 1024} /> // 5MB per file, 10MB total
 */

export interface FileInputProps {
  value?: FileList | File[];
  onChange?: (files: FileList | File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'error' | 'success';
  label?: string;
  description?: string;
  /** @deprecated Use maxFileSize and maxTotalSize instead */
  maxSize?: number; // in bytes
  maxFileSize?: number; // in bytes - maximum size per individual file
  maxTotalSize?: number; // in bytes - maximum total size for all files
  maxFiles?: number;
  labelKey?: string;
  descriptionKey?: string;
  namespace?: string;
}

export const FileInput = forwardRef<HTMLInputElement, FileInputProps>(({
  value,
  onChange,
  accept,
  multiple = false,
  disabled = false,
  required = false,
  className = '',
  size: _size = 'md',
  variant = 'default',
  label,
  description,
  maxSize, // deprecated
  maxFileSize,
  maxTotalSize,
  maxFiles: _maxFiles,
  labelKey: _labelKey,
  descriptionKey: _descriptionKey,
  namespace: _namespace = 'common'
}, ref) => {
  const [isDragOver, setIsDragOver] = useState(false);
  
  // Backward compatibility: if maxSize is provided but new props are not, use maxSize for both
  const effectiveMaxFileSize = maxFileSize ?? maxSize;
  const effectiveMaxTotalSize = maxTotalSize ?? maxSize;
  
  // TODO: Add i18n support when useTranslation hook is available
  // const { t } = useTranslation(namespace);
  // const displayLabel = labelKey ? t(labelKey) : label;
  // const displayDescription = descriptionKey ? t(descriptionKey) : description;
  
  const displayLabel = label;
  const displayDescription = description;

  // Generate stable unique IDs for accessibility
  const generatedId = useUniqueId('file-input');
  const inputId = generatedId;
  const descriptionId = `${inputId}-description`;


  const variantClasses = {
    default: 'border-gray-300 dark:border-gray-600 focus:ring-accent-500 focus:border-accent-500',
    error: 'border-red-300 dark:border-red-600 focus:ring-red-500 focus:border-red-500',
    success: 'border-green-300 dark:border-green-600 focus:ring-green-500 focus:border-green-500'
  };

  const handleFileChange = useCallback((e: Event) => {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (files) {
      onChange?.(Array.from(files));
    }
  }, [onChange]);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    // Only clear drag state if the pointer actually leaves the drop zone
    // Ignore dragleave events when moving between child elements
    if (e.relatedTarget && (e.currentTarget as Element).contains(e.relatedTarget as Node)) {
      return;
    }
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = e.dataTransfer?.files;
    if (files) {
      onChange?.(Array.from(files));
    }
  }, [onChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (disabled) return;
    
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      // Trigger file input click
      const input = document.getElementById(inputId) as HTMLInputElement;
      if (input) {
        input.click();
      }
    }
  }, [disabled, inputId]);


  const files = Array.isArray(value) ? value : value ? Array.from(value) : [];
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <div className="w-full">
      {displayLabel && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
          {displayLabel}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={displayLabel || "File upload area"}
        aria-disabled={disabled}
        className={cn(
          'relative border-2 border-dashed rounded-lg transition-colors',
          'hover:border-accent-400 dark:hover:border-accent-500',
          isDragOver ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20' : 'border-gray-300 dark:border-gray-600',
          variantClasses[variant],
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onKeyDown={handleKeyDown}
      >
        <input
          ref={ref}
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          required={required}
          onChange={handleFileChange}
          aria-describedby={displayDescription ? descriptionId : undefined}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />
        
        <div className="p-6 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500"
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          
          <div className="mt-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium text-accent-600 dark:text-accent-400">
                Click to upload
              </span>
              {' '}or drag and drop
            </p>
            {accept && (
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                {accept}
              </p>
            )}
          </div>
        </div>
      </div>
      
      {files.length > 0 && (
        <div className="mt-3 space-y-2">
          {files.map((file, index) => (
            <div key={index} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {file.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatFileSize(file.size)}
                </p>
              </div>
              {effectiveMaxFileSize && file.size > effectiveMaxFileSize && (
                <span className="text-xs text-red-600 dark:text-red-400">
                  File too large (max {formatFileSize(effectiveMaxFileSize)})
                </span>
              )}
            </div>
          ))}
          
          {effectiveMaxTotalSize && totalSize > effectiveMaxTotalSize && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Total size exceeds {formatFileSize(effectiveMaxTotalSize)}
            </p>
          )}
        </div>
      )}
      
      {displayDescription && (
        <p id={descriptionId} className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {displayDescription}
        </p>
      )}
    </div>
  );
});
