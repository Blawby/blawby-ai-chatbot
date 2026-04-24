import { useCallback, useRef, useState } from 'preact/hooks';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';

interface UploadDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  multiple?: boolean;
  accept?: string;
  label?: string;
  helperText?: string;
  className?: string;
}

export const UploadDropzone = ({
  onFilesSelected,
  disabled = false,
  multiple = true,
  accept,
  label = 'Upload files',
  helperText,
  className,
}: UploadDropzoneProps) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleSelect = useCallback((files: FileList | File[] | null | undefined) => {
    if (disabled || !files) return;
    const selected = Array.from(files);
    if (selected.length > 0) {
      onFilesSelected(selected);
    }
  }, [disabled, onFilesSelected]);

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled}
      className={cn(
        'rounded-xl border-2 border-dashed px-3 py-4 transition-colors',
        isDragOver ? 'border-accent-500 bg-accent-500/10' : 'border-line-glass/25',
        disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-line-glass/45',
        className
      )}
      onClick={() => {
        if (disabled) return;
        inputRef.current?.click();
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
        setIsDragOver(true);
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDragLeave={(event) => {
        if (disabled) return;
        event.preventDefault();
        if (event.relatedTarget && (event.currentTarget as Element).contains(event.relatedTarget as Node)) {
          return;
        }
        setIsDragOver(false);
      }}
      onDrop={(event) => {
        if (disabled) return;
        event.preventDefault();
        setIsDragOver(false);
        handleSelect(event.dataTransfer?.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          const target = event.target as HTMLInputElement;
          handleSelect(target.files);
          target.value = '';
        }}
      />
      <div className="flex items-center gap-2 text-input-text">
        <Icon icon={ArrowUpTrayIcon} className="h-4 w-4" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      {helperText ? (
        <p className="mt-1 text-xs text-input-placeholder">{helperText}</p>
      ) : null}
    </div>
  );
};

