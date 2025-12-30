import { forwardRef, useCallback } from 'preact/compat';
import { LinkIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '@/shared/utils/cn';
import { useUniqueId } from '@/shared/hooks/useUniqueId';

export interface URLInputProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'error' | 'success';
  label?: string;
  description?: string;
  error?: string;
  showValidation?: boolean;
  showPreview?: boolean;
  protocols?: string[];
  _labelKey?: string;
  _descriptionKey?: string;
  _placeholderKey?: string;
  _errorKey?: string;
  _namespace?: string;
}

export const URLInput = forwardRef<HTMLInputElement, URLInputProps>(({
  value = '',
  onChange,
  placeholder,
  disabled = false,
  required = false,
  className = '',
  size = 'md',
  variant = 'default',
  label,
  description,
  error,
  showValidation = false,
  showPreview = false,
  protocols = ['http://', 'https://'],
  _labelKey,
  _descriptionKey,
  _placeholderKey,
  _errorKey,
  _namespace = 'common'
}, ref) => {
  // TODO: Add i18n support when useTranslation hook is available
  // const { t } = useTranslation(namespace);
  // const displayLabel = labelKey ? t(labelKey) : label;
  // const displayDescription = descriptionKey ? t(descriptionKey) : description;
  // const displayPlaceholder = placeholderKey ? t(placeholderKey) : placeholder;
  // const displayError = errorKey ? t(errorKey) : error;
  
  const displayLabel = label;
  const displayDescription = description;
  const displayPlaceholder = placeholder;
  const displayError = error;

  // Generate unique IDs for accessibility
  const inputId = useUniqueId('url-input');
  const descriptionId = useUniqueId('url-description');
  const errorId = useUniqueId('url-error');
  const validationErrorId = useUniqueId('url-validation-error');
  
  // URL validation function - defined before use
  const isValidURL = useCallback((url: string) => {
    if (!url) return false;
    
    try {
      const urlObj = new URL(url);
      // Normalize protocols to match URL.protocol format (e.g., "http:", "https:")
      const normalizedProtocols = protocols.map(protocol => {
        if (protocol.endsWith('://')) {
          return `${protocol.slice(0, -3)}:`;
        } else if (protocol.endsWith(':')) {
          return protocol;
        } else {
          return `${protocol}:`;
        }
      });
      return normalizedProtocols.includes(urlObj.protocol);
    } catch {
      return false;
    }
  }, [protocols]);
  
  // URL validation and icon display logic
  const isURLValid = value ? isValidURL(value) : false;
  const showValidationIcon = showValidation && value.length > 0;
  
  // Create aria-describedby string
  const ariaDescribedBy = [
    displayDescription ? descriptionId : null,
    displayError ? errorId : null,
    showValidation && value && !isURLValid && !displayError ? validationErrorId : null
  ].filter(Boolean).join(' ');

  const sizeClasses = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base'
  };

  const iconPaddingClasses = {
    sm: 'pl-8',
    md: 'pl-10',
    lg: 'pl-12'
  };

  const variantClasses = {
    default: 'border-gray-300 dark:border-gray-600 focus:ring-accent-500 focus:border-accent-500',
    error: 'border-red-300 dark:border-red-600 focus:ring-red-500 focus:border-red-500',
    success: 'border-green-300 dark:border-green-600 focus:ring-green-500 focus:border-green-500'
  };

  const inputClasses = cn(
    'w-full border rounded-lg bg-white dark:bg-dark-input-bg text-gray-900 dark:text-white',
    'focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors',
    sizeClasses[size],
    iconPaddingClasses[size],
    variantClasses[variant],
    disabled && 'opacity-50 cursor-not-allowed',
    className
  );

  // Helper function to normalize URL after protocol removal
  const normalizeUrlAfterProtocol = useCallback((urlWithoutProtocol: string, defaultProtocol: { scheme: string; usesSlashes: boolean }): string | null => {
    // 1. Detect and preserve any leading credentials (user:pass@)
    // Stricter regex: username (no @, :, or /) + : + password (no @ or /) + @
    const credentialsRegex = /^([^@:/]+:[^@/]+@)/;
    const credentialsMatch = urlWithoutProtocol.match(credentialsRegex);
    let credentials = '';
    let urlAfterCredentials = urlWithoutProtocol;
    
    if (credentialsMatch) {
      credentials = credentialsMatch[1];
      urlAfterCredentials = urlWithoutProtocol.substring(credentialsMatch[0].length);
    }
    
    // 2. Normalize malformed separators by collapsing multiple leading slashes
    let normalizedUrl = urlAfterCredentials;
    if (defaultProtocol.usesSlashes) {
      // Collapse multiple leading slashes to a single pair
      normalizedUrl = urlAfterCredentials.replace(/^\/+/, '//');
    }
    
    // 3. Validate that there's a non-empty host/path segment after normalization
    const hasValidContent = normalizedUrl && 
      normalizedUrl !== '//' && 
      normalizedUrl !== '/' && 
      normalizedUrl.trim() !== '';
    
    if (!hasValidContent) {
      // Return null if no valid content after normalization
      return null;
    }
    
    // 4. Return the reconstructed string (credentials + normalized remainder)
    return `${credentials}${normalizedUrl}`;
  }, []);

  const normalizeURL = useCallback((url: string) => {
    if (!url) return '';
    
    // Normalize protocols into canonical pairs of {scheme, usesSlashes}
    const protocolMap = protocols.map(protocol => {
      // Handle different protocol formats
      if (protocol.endsWith('://')) {
        return { scheme: protocol.slice(0, -3), usesSlashes: true };
      } else if (protocol.endsWith(':')) {
        return { scheme: protocol.slice(0, -1), usesSlashes: false };
      } else {
        // Default to using slashes for common web protocols
        const commonWebProtocols = ['http', 'https', 'ftp', 'ftps'];
        const usesSlashes = commonWebProtocols.includes(protocol);
        return { scheme: protocol, usesSlashes };
      }
    });
    
    // Extract existing scheme and separator using regex
    const protocolRegex = /^([a-zA-Z][a-zA-Z0-9+.-]*)(:)(\/\/)?/;
    const match = url.match(protocolRegex);
    
    if (match) {
      const [, scheme, _separator, slashes] = match;
      const usesSlashes = !!slashes;
      
      // Check if this scheme is in our allowed protocols
      const allowedProtocol = protocolMap.find(p => 
        p.scheme === scheme && p.usesSlashes === usesSlashes
      );
      
      if (allowedProtocol) {
        // Return original URL unchanged if it has a valid protocol
        return url;
      } else {
        // Remove the invalid protocol and separator
        const urlWithoutProtocol = url.substring(match[0].length);
        
        // Use the first allowed protocol or default to https
        const defaultProtocol = protocolMap.length > 0 ? protocolMap[0] : { scheme: 'https', usesSlashes: true };
        
        const normalizedUrlPart = normalizeUrlAfterProtocol(urlWithoutProtocol, defaultProtocol);
        if (!normalizedUrlPart) {
          // Return original input unchanged if no valid content after normalization
          return url;
        }
        
        const prefix = defaultProtocol.usesSlashes ? `${defaultProtocol.scheme}://` : `${defaultProtocol.scheme}:`;
        
        return `${prefix}${normalizedUrlPart}`;
      }
    } else {
      // No existing protocol, prepend default
      const defaultProtocol = protocolMap.length > 0 ? protocolMap[0] : { scheme: 'https', usesSlashes: true };
      
      const normalizedUrlPart = normalizeUrlAfterProtocol(url, defaultProtocol);
      if (!normalizedUrlPart) {
        // Return original input unchanged if no valid content after normalization
        return url;
      }
      
      const prefix = defaultProtocol.usesSlashes ? `${defaultProtocol.scheme}://` : `${defaultProtocol.scheme}:`;
      
      return `${prefix}${normalizedUrlPart}`;
    }
  }, [protocols, normalizeUrlAfterProtocol]);

  const handleChange = useCallback((e: Event) => {
    const target = e.target as HTMLInputElement;
    const inputValue = target.value;
    onChange?.(inputValue);
  }, [onChange]);

  const handleBlur = useCallback((e: Event) => {
    const target = e.target as HTMLInputElement;
    const inputValue = target.value;
    const normalizedValue = normalizeURL(inputValue);
    onChange?.(normalizedValue);
  }, [onChange, normalizeURL]);

  return (
    <div className="w-full">
      {displayLabel && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
          {displayLabel}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          <LinkIcon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        </div>
        
        <input
          ref={ref}
          id={inputId}
          type="url"
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={displayPlaceholder}
          disabled={disabled}
          required={required}
          aria-describedby={ariaDescribedBy || undefined}
          className={inputClasses}
        />
        
        {showValidationIcon && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            {isURLValid ? (
              <CheckIcon className="w-4 h-4 text-green-600 dark:text-green-400" />
            ) : (
              <XMarkIcon className="w-4 h-4 text-red-600 dark:text-red-400" />
            )}
          </div>
        )}
      </div>
      
      {showPreview && isURLValid && (() => {
        // Check if URL protocol is safe for clickable preview
        let isSafeProtocol = false;
        try {
          const urlObj = new URL(value);
          const protocol = urlObj.protocol.toLowerCase();
          isSafeProtocol = protocol === 'http:' || protocol === 'https:';
        } catch {
          isSafeProtocol = false;
        }
        
        return (
          <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded border">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Preview:</p>
            {isSafeProtocol ? (
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent-600 dark:text-accent-400 hover:underline"
              >
                {value}
              </a>
            ) : (
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {value}
              </span>
            )}
          </div>
        );
      })()}
      
      {displayError && (
        <p id={errorId} className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert" aria-live="assertive">
          {displayError}
        </p>
      )}
      
      {showValidation && value && !isURLValid && !displayError && (
        <p id={validationErrorId} className="text-xs text-red-600 dark:text-red-400 mt-1">
          Please enter a valid URL.
        </p>
      )}
      
      {displayDescription && !displayError && (
        <p id={descriptionId} className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {displayDescription}
        </p>
      )}
    </div>
  );
});
