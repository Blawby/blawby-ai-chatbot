import { useState, useCallback } from 'preact/hooks';
import { ZodSchema, ZodError, ZodObject } from 'zod';

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export interface UseFormValidationOptions<T> {
  schema: ZodSchema<T>;
  initialValues?: Partial<T>;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
}

export function useFormValidation<T extends Record<string, unknown>>({
  schema,
  initialValues = {},
  validateOnChange = true,
  validateOnBlur = true,
}: UseFormValidationOptions<T>) {
  const [values, setValues] = useState<Partial<T>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const validateField = useCallback((fieldName: keyof T, value: unknown) => {
    try {
      // Check if schema is a ZodObject (has pick method)
      if (schema instanceof ZodObject) {
        // For ZodObject, we can safely use pick to validate just this field
        const fieldSchema = schema.pick({ [fieldName]: true } as Record<keyof T, true>);
        fieldSchema.parse({ [fieldName]: value });
      } else {
        // For unions, intersections, or other schema types, validate the full object
        // and extract the specific field error if validation fails
        const fullObject = { ...values, [fieldName]: value };
        schema.parse(fullObject);
      }
      
      // Clear error for this field
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldName as string];
        return newErrors;
      });
      
      return true;
    } catch (error) {
      if (error instanceof ZodError) {
        const fieldError = error.issues.find(e => e.path[0] === fieldName);
        if (fieldError) {
          setErrors(prev => ({
            ...prev,
            [fieldName as string]: fieldError.message,
          }));
        }
      }
      return false;
    }
  }, [schema, values]);

  const validateForm = useCallback(() => {
    try {
      schema.parse(values);
      setErrors({});
      return { isValid: true, errors: {} };
    } catch (error) {
      if (error instanceof ZodError) {
        const formErrors: Record<string, string> = {};
        error.issues.forEach((err) => {
          const fieldName = err.path[0] as string;
          formErrors[fieldName] = err.message;
        });
        setErrors(formErrors);
        return { isValid: false, errors: formErrors };
      }
      return { isValid: false, errors: {} };
    }
  }, [schema, values]);

  const setValue = useCallback((fieldName: keyof T, value: unknown) => {
    setValues(prev => ({ ...prev, [fieldName]: value }));
    
    if (validateOnChange) {
      validateField(fieldName, value);
    }
  }, [validateField, validateOnChange]);

  const setTouchedField = useCallback((fieldName: keyof T) => {
    setTouched(prev => ({ ...prev, [fieldName]: true }));
    
    if (validateOnBlur) {
      validateField(fieldName, values[fieldName]);
    }
  }, [validateField, validateOnBlur, values]);

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
  }, [initialValues]);

  const getFieldError = useCallback((fieldName: keyof T) => {
    return errors[fieldName as string] || '';
  }, [errors]);

  const isFieldTouched = useCallback((fieldName: keyof T) => {
    return touched[fieldName as string] || false;
  }, [touched]);

  const hasFieldError = useCallback((fieldName: keyof T) => {
    return !!errors[fieldName as string];
  }, [errors]);

  return {
    values,
    errors,
    touched,
    setValue,
    setTouchedField,
    validateForm,
    validateField,
    reset,
    getFieldError,
    isFieldTouched,
    hasFieldError,
  };
}
