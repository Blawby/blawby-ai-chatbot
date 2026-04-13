import { forwardRef } from 'preact/compat';
import { useRef } from 'preact/hooks';
import { UserIcon } from '@heroicons/react/24/outline';
import { useUniqueId } from '@/shared/hooks/useUniqueId';
import { cn } from '@/shared/utils/cn';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';

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
 triggerMode?: 'button' | 'avatar';
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
 triggerMode = 'button',
 onChange
}, ref) => {
 const internalRef = useRef<HTMLInputElement | null>(null);
 const inputId = useUniqueId('logo-upload');
 const hasImage = typeof imageUrl === 'string' && imageUrl.trim().length > 0;

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
    <label htmlFor={inputId} className="block text-sm font-medium text-input-text">
     {label}
     {required && <span className="ml-1 text-[rgb(var(--error-foreground))]">*</span>}
    </label>
   )}
   {description && (
    <p className="mt-1 text-xs text-input-placeholder">
     {description}
    </p>
   )}
   <div className="mt-2 flex items-center gap-x-3">
    <div
     className={cn('relative shrink-0', triggerMode === 'avatar' && !disabled && 'cursor-pointer')}
     style={{ width: ringSize, height: ringSize }}
     onClick={triggerMode === 'avatar' ? handleButtonClick : undefined}
     onKeyDown={triggerMode === 'avatar' ? (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
       event.preventDefault();
       handleButtonClick();
      }
     } : undefined}
     role={triggerMode === 'avatar' ? 'button' : undefined}
     tabIndex={triggerMode === 'avatar' && !disabled ? 0 : undefined}
     aria-label={triggerMode === 'avatar' ? buttonLabel : undefined}
     aria-disabled={triggerMode === 'avatar' && disabled ? 'true' : undefined}
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
     className="absolute inset-1 overflow-hidden rounded-full glass-panel border border-line-glass/10"
     style={{ width: size, height: size, left: 4, top: 4 }}
    >
    {hasImage ? (
     <img
      src={imageUrl ?? ''}
      alt={name ? `${name} logo` : 'Practice logo'}
      className="h-full w-full object-cover"
     />
    ) : (
     <div className="flex h-full w-full items-center justify-center bg-surface-utility/40">
      <Icon icon={UserIcon} className="h-1/2 w-1/2 text-input-placeholder" />
     </div>
    )}
    </div>
    </div>
    <div className="flex items-center gap-2">
     {triggerMode === 'button' && (
      <Button
       type="button"
       variant="secondary"
       size="sm"
       onClick={handleButtonClick}
       disabled={disabled}
      >
       {buttonLabel}
      </Button>
     )}
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
