import { createContext, ComponentChildren } from 'preact';
import { useState, useCallback, useContext, useEffect, useRef } from 'preact/hooks';
import { cn } from '../../../utils/cn';
import { deepEqual } from '../../../utils/deepEqual';
import { ZodSchema } from 'zod';

export interface FormData {
  [key: string]: unknown;
}

export interface FormError {
  code: string;
  field: string;
  message: string;
}

export interface FormContextValue<T extends FormData = FormData> {
  data: T;
  errors: FormError[];
  isSubmitting: boolean;
  isValid: boolean;
  submissionError: string | null;
  validateOnChange: boolean;
  validateOnBlur: boolean;
  setFieldValue: (field: string, value: unknown) => void;
  setFieldError: (field: string, error: FormError) => void;
  clearFieldError: (field: string) => void;
  setSubmitting: (submitting: boolean) => void;
  validate: () => boolean;
  validateField: (field: string) => boolean;
  reset: () => void;
  onFieldBlur: (field: string) => void;
}

const FormContext = createContext<FormContextValue | null>(null);

export const useFormContext = () => {
  const context = useContext(FormContext);
  if (!context) {
    throw new Error('useFormContext must be used within a Form component');
  }
  return context;
};

export interface FormProps<T extends FormData = FormData> {
  children: ComponentChildren;
  initialData?: T;
  onSubmit?: (data: T) => void | Promise<void>;
  /**
   * Optional callback to handle form submission errors.
   * Called with the caught error when onSubmit throws an exception.
   * If not provided, errors are stored in form state and displayed to the user.
   */
  onSubmitError?: (error: unknown) => void;
  schema?: ZodSchema<unknown>;
  className?: string;
  disabled?: boolean;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  requiredFields?: string[];
}

export function Form<T extends FormData = FormData>({
  children,
  initialData = {},
  onSubmit,
  onSubmitError,
  schema,
  className = '',
  disabled = false,
  validateOnChange = false,
  validateOnBlur = false,
  requiredFields
}: FormProps<T>) {
  const [data, setData] = useState<T>(initialData as T);
  const [errors, setErrors] = useState<FormError[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  
  // Store previous initialData to compare content changes
  const prevInitialDataRef = useRef<T>(initialData as T);

  // Rehydrate form when initialData content actually changes
  useEffect(() => {
    // Only reset if the content has actually changed (deep equality check)
    if (!deepEqual(prevInitialDataRef.current, initialData)) {
      setData(initialData);
      setErrors([]); // Clear any stale validation errors
      setSubmissionError(null); // Clear any stale submission errors
      prevInitialDataRef.current = initialData;
    }
  }, [initialData]);

  const validate = useCallback(() => {
    const newErrors: FormError[] = [];
    
    // Use schema validation if provided
    if (schema) {
      const result = schema.safeParse(data);
      if (!result.success) {
        result.error.issues.forEach(issue => {
          const field = issue.path.length ? issue.path.join('.') : 'unknown';
          newErrors.push({
            code: 'invalid',
            field,
            message: issue.message
          });
        });
      }
      // Note: When a schema is provided, only schema-defined validation rules apply.
      // The schema should define all required fields and validation constraints.
    } else {
      // No schema provided, use basic required validation for all fields; NOTE: empty strings are allowed by default — use a schema or requiredFields prop for stricter rules.
      const fieldsToValidate = requiredFields || Object.keys(data);
      fieldsToValidate.forEach(field => {
        const value = data[field];
        if (value === undefined || value === null) {
          newErrors.push({
            code: 'required',
            field,
            message: `${field} is required`
          });
        }
      });
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  }, [data, schema, requiredFields]);

  const validateField = useCallback((field: string) => {
    const newErrors: FormError[] = [];
    
    // Use schema validation if provided
    if (schema) {
      const result = schema.safeParse(data);
      if (!result.success) {
        result.error.issues.forEach(issue => {
          const issueField = issue.path.length ? issue.path.join('.') : 'unknown';
          if (issueField === field) {
            newErrors.push({
              code: 'invalid',
              field: issueField,
              message: issue.message
            });
          }
        });
      }
    } else {
      // No schema provided, use basic required validation for the specific field
      const fieldsToValidate = requiredFields || Object.keys(data);
      if (fieldsToValidate.includes(field)) {
        const value = data[field];
        if (value === undefined || value === null) {
          newErrors.push({
            code: 'required',
            field,
            message: `${field} is required`
          });
        }
      }
    }

    // Update errors by removing existing errors for this field and adding new ones
    setErrors(prev => {
      const filtered = prev.filter(error => error.field !== field);
      return [...filtered, ...newErrors];
    });
    
    return newErrors.length === 0;
  }, [data, schema, requiredFields]);

  // Handle validation on change
  useEffect(() => {
    if (validateOnChange) {
      validate();
    }
  }, [data, validateOnChange, validate]);

  const setFieldValue = useCallback((field: string, value: unknown) => {
    setData(prev => ({ ...prev, [field]: value }));
    // Only clear field error when validateOnChange is false/undefined
    // to avoid conflict with automatic validation that would cause flicker
    if (!validateOnChange) {
      setErrors(prev => prev.filter(error => error.field !== field));
    }
  }, [validateOnChange, setErrors]);

  const setFieldError = useCallback((field: string, error: FormError) => {
    setErrors(prev => {
      const filtered = prev.filter(e => e.field !== field);
      return [...filtered, error];
    });
  }, []);

  const clearFieldError = useCallback((field: string) => {
    setErrors(prev => prev.filter(error => error.field !== field));
  }, []);

  const setSubmitting = useCallback((submitting: boolean) => {
    setIsSubmitting(submitting);
  }, []);

  const reset = useCallback(() => {
    setData(initialData);
    setErrors([]);
    setIsSubmitting(false);
    setSubmissionError(null);
    prevInitialDataRef.current = initialData;
  }, [initialData]);

  const onFieldBlur = useCallback((field: string) => {
    if (validateOnBlur) {
      validateField(field);
    }
  }, [validateOnBlur, validateField]);

  const handleSubmit = useCallback(async (e: Event) => {
    e.preventDefault();
    
    if (disabled || isSubmitting) return;
    
    const isValid = validate();
    if (!isValid) return;
    
    setIsSubmitting(true);
    
    try {
      await onSubmit?.(data);
      // Clear any previous submission errors on successful submission
      setSubmissionError(null);
    } catch (error) {
      // Handle form submission error
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred during form submission';
      
      // Store error in form state for user notification
      setSubmissionError(errorMessage);
      
      // Call custom error handler if provided
      onSubmitError?.(error);
    } finally {
      setIsSubmitting(false);
    }
  }, [data, disabled, isSubmitting, onSubmit, onSubmitError, validate]);

  const isValid = errors.length === 0;

  const contextValue: FormContextValue<T> = {
    data,
    errors,
    isSubmitting,
    isValid,
    submissionError,
    validateOnChange,
    validateOnBlur,
    setFieldValue,
    setFieldError,
    clearFieldError,
    setSubmitting,
    validate,
    validateField,
    reset,
    onFieldBlur
  };

  return (
    <FormContext.Provider value={contextValue}>
      <form
        onSubmit={handleSubmit}
        className={cn('space-y-4', className)}
        noValidate
      >
        {children}
      </form>
    </FormContext.Provider>
  );
}
