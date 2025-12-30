
export interface AriaLabelProps {
  id?: string;
  label?: string;
  description?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  expanded?: boolean;
}

export function generateAriaLabels({
  id,
  label,
  description,
  error,
  required = false,
  disabled = false,
}: AriaLabelProps) {
  const baseId = id || `input-${Math.random().toString(36).slice(2, 11)}`;
  const labelId = `${baseId}-label`;
  const descriptionId = `${baseId}-description`;
  const errorId = `${baseId}-error`;

  return {
    id: baseId,
    labelId,
    descriptionId,
    errorId,
    ariaLabel: label,
    ariaDescribedBy: [
      description ? descriptionId : null,
      error ? errorId : null,
    ].filter(Boolean).join(' ') || undefined,
    ariaRequired: required,
    ariaInvalid: !!error,
    ariaDisabled: disabled,
  };
}

export function generateFieldAriaLabels(fieldName: string, options: AriaLabelProps = {}) {
  return generateAriaLabels({
    id: `${fieldName}-field`,
    ...options,
  });
}

// Common ARIA patterns for form components
export const ARIA_PATTERNS = {
  // Input field
  input: (fieldName: string, options: AriaLabelProps = {}) => ({
    id: `${fieldName}-input`,
    'aria-labelledby': `${fieldName}-label`,
    'aria-describedby': [
      options.description ? `${fieldName}-description` : null,
      options.error ? `${fieldName}-error` : null,
    ].filter(Boolean).join(' ') || undefined,
    'aria-required': options.required,
    'aria-invalid': !!options.error,
    'aria-disabled': options.disabled,
  }),
  
  // Label
  label: (fieldName: string, _options: AriaLabelProps = {}) => ({
    id: `${fieldName}-label`,
    htmlFor: `${fieldName}-input`,
  }),
  
  // Description
  description: (fieldName: string) => ({
    id: `${fieldName}-description`,
  }),
  
  // Error message
  error: (fieldName: string) => ({
    id: `${fieldName}-error`,
    role: 'alert',
    'aria-live': 'assertive',
  }),
  
  // Button
  button: (action: string, options: { disabled?: boolean; pressed?: boolean } = {}) => ({
    'aria-label': action,
    'aria-disabled': options.disabled,
    'aria-pressed': options.pressed,
  }),
  
  // Toggle
  toggle: (fieldName: string, checked: boolean, options: AriaLabelProps = {}) => ({
    id: `${fieldName}-toggle`,
    role: 'switch',
    'aria-checked': checked,
    'aria-labelledby': `${fieldName}-label`,
    'aria-describedby': [
      options.description ? `${fieldName}-description` : null,
      options.error ? `${fieldName}-error` : null,
    ].filter(Boolean).join(' ') || undefined,
    'aria-required': options.required,
    'aria-disabled': options.disabled,
  }),
  
  // Select/Dropdown
  select: (fieldName: string, options: AriaLabelProps = {}) => ({
    id: `${fieldName}-select`,
    role: 'combobox',
    'aria-haspopup': 'listbox',
    ...(options.expanded !== undefined && { 'aria-expanded': options.expanded }),
    'aria-labelledby': `${fieldName}-label`,
    'aria-describedby': [
      options.description ? `${fieldName}-description` : null,
      options.error ? `${fieldName}-error` : null,
    ].filter(Boolean).join(' ') || undefined,
    'aria-required': options.required,
    'aria-disabled': options.disabled,
  }),
  
  // Listbox
  listbox: (fieldName: string) => ({
    id: `${fieldName}-listbox`,
    role: 'listbox',
    'aria-labelledby': `${fieldName}-label`,
  }),
  
  // Option
  option: (fieldName: string, value: string, selected: boolean) => ({
    id: `${fieldName}-option-${value}`,
    role: 'option',
    'aria-selected': selected,
    value,
  }),
} as const;
