import { createContext, ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef } from 'preact/hooks';
import { type Signal, type ReadonlySignal, batch } from '@preact/signals';
import { useSignal, useComputed, useSignalEffect } from '@preact/signals';
import { cn } from '@/shared/utils/cn';
import { deepEqual } from '@/shared/utils/deepEqual';
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
  // Signal-based state — consumers read .value (or via useComputed for per-field isolation).
  // Form itself never reads these signals during render, so field changes don't re-render Form.
  dataSignal: Signal<T>;
  errorsSignal: Signal<FormError[]>;
  isSubmittingSignal: Signal<boolean>;
  submissionErrorSignal: Signal<string | null>;
  isValidComputed: ReadonlySignal<boolean>;
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

export const useFormContext = <T extends FormData = FormData>() => {
  const context = useContext(FormContext) as FormContextValue<T> | null;
  if (!context) {
    throw new Error('useFormContext must be used within a Form component');
  }
  return context;
};

export interface FormProps<T extends FormData = FormData> {
  children: ComponentChildren;
  id?: string;
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
  id,
  initialData,
  onSubmit,
  onSubmitError,
  schema,
  className = '',
  disabled = false,
  validateOnChange = false,
  validateOnBlur = false,
  requiredFields
}: FormProps<T>) {
  const dataSignal = useSignal<T>((initialData ?? ({} as T)) as T);
  const errorsSignal = useSignal<FormError[]>([]);
  const isSubmittingSignal = useSignal(false);
  const submissionErrorSignal = useSignal<string | null>(null);
  const isValidComputed = useComputed(() => errorsSignal.value.length === 0);

  // Stable refs for use inside callbacks without re-creating closures.
  const schemaRef = useRef(schema);
  const requiredFieldsRef = useRef(requiredFields);
  const onSubmitRef = useRef(onSubmit);
  const onSubmitErrorRef = useRef(onSubmitError);
  const disabledRef = useRef(disabled);
  schemaRef.current = schema;
  requiredFieldsRef.current = requiredFields;
  onSubmitRef.current = onSubmit;
  onSubmitErrorRef.current = onSubmitError;
  disabledRef.current = disabled;

  // Store previous initialData to compare content changes
  const prevInitialDataRef = useRef<T>((initialData ?? ({} as T)) as T);

  // Rehydrate form when initialData content actually changes
  useEffect(() => {
    if (!deepEqual(prevInitialDataRef.current, (initialData ?? ({} as T)) as T)) {
      batch(() => {
        dataSignal.value = (initialData ?? ({} as T)) as T;
        errorsSignal.value = [];
        submissionErrorSignal.value = null;
      });
      prevInitialDataRef.current = (initialData ?? ({} as T)) as T;
    }
  }, [initialData, dataSignal, errorsSignal, submissionErrorSignal]);

  const validate = useCallback(() => {
    const data = dataSignal.value;
    const newErrors: FormError[] = [];

    if (schemaRef.current) {
      const result = schemaRef.current.safeParse(data);
      if (!result.success) {
        result.error.issues.forEach(issue => {
          const field = issue.path.length ? issue.path.join('.') : 'unknown';
          newErrors.push({ code: 'invalid', field, message: issue.message });
        });
      }
    } else {
      const fieldsToValidate = requiredFieldsRef.current || Object.keys(data);
      fieldsToValidate.forEach(field => {
        const value = data[field];
        if (value === undefined || value === null) {
          newErrors.push({ code: 'required', field, message: `${field} is required` });
        }
      });
    }

    errorsSignal.value = newErrors;
    return newErrors.length === 0;
  }, [dataSignal, errorsSignal]);

  const validateField = useCallback((field: string) => {
    const data = dataSignal.value;
    const newErrors: FormError[] = [];

    if (schemaRef.current) {
      const result = schemaRef.current.safeParse(data);
      if (!result.success) {
        result.error.issues.forEach(issue => {
          const issueField = issue.path.length ? issue.path.join('.') : 'unknown';
          if (issueField === field) {
            newErrors.push({ code: 'invalid', field: issueField, message: issue.message });
          }
        });
      }
    } else {
      const fieldsToValidate = requiredFieldsRef.current || Object.keys(data);
      if (fieldsToValidate.includes(field)) {
        const value = data[field];
        if (value === undefined || value === null) {
          newErrors.push({ code: 'required', field, message: `${field} is required` });
        }
      }
    }

    errorsSignal.value = [
      ...errorsSignal.value.filter(e => e.field !== field),
      ...newErrors,
    ];
    return newErrors.length === 0;
  }, [dataSignal, errorsSignal]);

  // Re-validate when data changes if validateOnChange is enabled.
  useSignalEffect(() => {
    if (!validateOnChange) return;
    // Touch dataSignal to subscribe; validate() reads it again.
    void dataSignal.value;
    validate();
  });

  const setFieldValue = useCallback((field: string, value: unknown) => {
    batch(() => {
      dataSignal.value = { ...dataSignal.value, [field]: value };
      if (!validateOnChange) {
        errorsSignal.value = errorsSignal.value.filter(error => error.field !== field);
      }
    });
  }, [dataSignal, errorsSignal, validateOnChange]);

  const setFieldError = useCallback((field: string, error: FormError) => {
    errorsSignal.value = [...errorsSignal.value.filter(e => e.field !== field), error];
  }, [errorsSignal]);

  const clearFieldError = useCallback((field: string) => {
    errorsSignal.value = errorsSignal.value.filter(error => error.field !== field);
  }, [errorsSignal]);

  const setSubmitting = useCallback((submitting: boolean) => {
    isSubmittingSignal.value = submitting;
  }, [isSubmittingSignal]);

  const reset = useCallback(() => {
    batch(() => {
      dataSignal.value = (initialData ?? ({} as T)) as T;
      errorsSignal.value = [];
      isSubmittingSignal.value = false;
      submissionErrorSignal.value = null;
    });
    prevInitialDataRef.current = (initialData ?? ({} as T)) as T;
  }, [initialData, dataSignal, errorsSignal, isSubmittingSignal, submissionErrorSignal]);

  const onFieldBlur = useCallback((field: string) => {
    if (validateOnBlur) {
      validateField(field);
    }
  }, [validateOnBlur, validateField]);

  const handleSubmit = useCallback(async (e: Event) => {
    e.preventDefault();

    if (disabledRef.current || isSubmittingSignal.value) return;

    const isValid = validate();
    if (!isValid) return;

    isSubmittingSignal.value = true;

    try {
      await onSubmitRef.current?.(dataSignal.value);
      submissionErrorSignal.value = null;
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : 'An unexpected error occurred during form submission';
      submissionErrorSignal.value = errorMessage;
      onSubmitErrorRef.current?.(error);
    } finally {
      isSubmittingSignal.value = false;
    }
  }, [dataSignal, isSubmittingSignal, submissionErrorSignal, validate]);

  // Context value is memoized with stable references — Form does not re-render on
  // signal changes, and consumers see a stable provider value.
  const contextValue = useMemo<FormContextValue<T>>(() => ({
    dataSignal,
    errorsSignal,
    isSubmittingSignal,
    submissionErrorSignal,
    isValidComputed,
    validateOnChange,
    validateOnBlur,
    setFieldValue,
    setFieldError,
    clearFieldError,
    setSubmitting,
    validate,
    validateField,
    reset,
    onFieldBlur,
  }), [
    dataSignal,
    errorsSignal,
    isSubmittingSignal,
    submissionErrorSignal,
    isValidComputed,
    validateOnChange,
    validateOnBlur,
    setFieldValue,
    setFieldError,
    clearFieldError,
    setSubmitting,
    validate,
    validateField,
    reset,
    onFieldBlur,
  ]);

  return (
    <FormContext.Provider value={contextValue as FormContextValue}>
      <form
        id={id}
        onSubmit={handleSubmit}
        className={cn('space-y-4', className)}
        noValidate
      >
        {children}
      </form>
    </FormContext.Provider>
  );
}
