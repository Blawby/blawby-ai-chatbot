import { z } from 'zod';

// Common validation schemas
export const commonSchemas = {
  // Text validation
  required: z.string().min(1, 'This field is required'),
  optional: z.string().optional(),
  
  // Email validation
  email: z.string().email('Please enter a valid email address'),
  
  // Password validation
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  
  // Phone validation
  phone: z.string()
    .regex(/^\+?[\d\s\-()]+$/, 'Please enter a valid phone number')
    .min(10, 'Phone number must be at least 10 digits'),
  
  // URL validation
  url: z.string().url('Please enter a valid URL'),
  
  // Date validation
  date: z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime());
  }, 'Please enter a valid date'),
  
  // Birthday validation (required and not in future)
  birthday: z.string()
    .min(1, 'Birthday is required')
    .refine((val) => {
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, 'Please enter a valid birthday')
    .refine((val) => {
      const date = new Date(val);
      const today = new Date();

      // Create UTC midnight timestamps for comparison
      const birthdayUTC = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
      const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

      return birthdayUTC <= todayUTC;
    }, 'Birthday cannot be in the future'),
  
  // Number validation
  number: z.number().min(0, 'Number must be non-negative'),
  positiveNumber: z.number().positive('Number must be positive'),
  
  // File validation
  file: z.instanceof(File, { message: 'Please select a valid file' }),
  imageFile: z.instanceof(File).refine(
    (file) => file.type.startsWith('image/'),
    'Please select an image file'
  ),
  
  // Terms agreement
  termsAgreement: z.boolean().refine((val) => val === true, 'You must agree to the terms'),
};

// Form-specific schemas
export const authSchemas = {
  signIn: z.object({
    email: commonSchemas.email,
    password: z.string().min(1, 'Password is required'),
  }),
  
  signUp: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: commonSchemas.email,
    password: commonSchemas.password,
    confirmPassword: z.string(),
    agreedToTerms: commonSchemas.termsAgreement,
  }).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
};

export const onboardingSchemas = {
  personalInfo: z.object({
    fullName: z.string().min(2, 'Full name must be at least 2 characters'),
    birthday: commonSchemas.birthday,
    agreedToTerms: commonSchemas.termsAgreement,
  }),
  
  useCase: z.object({
    primaryUseCase: z.enum(['personal', 'business', 'research', 'documents', 'other']),
    additionalInfo: z.string().optional(),
  }),
};

export const settingsSchemas = {
  general: z.object({
    theme: z.enum(['light', 'dark', 'system']),
    accentColor: z.enum(['default', 'blue', 'green', 'purple', 'red']),
    language: z.string(),
    spokenLanguage: z.string(),
  }),
  
  security: z.object({
    twoFactorEnabled: z.boolean(),
  }),
  
  notifications: z.object({
    responses: z.object({
      push: z.boolean(),
      email: z.boolean(),
    }),
    tasks: z.object({
      push: z.boolean(),
      email: z.boolean(),
    }),
    messaging: z.object({
      push: z.boolean(),
      email: z.boolean(),
    }),
  }),
};

// Contact form schemas
export const contactSchemas = {
  contactForm: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: commonSchemas.email,
    phone: commonSchemas.phone,
    location: z.string().optional().refine(
      (val) => val === undefined || val === '' || val.length >= 2,
      'Location must be at least 2 characters'
    ),
    opposingParty: z.string().optional(),
  }),
};

// Export all schemas
export const schemas = {
  common: commonSchemas,
  auth: authSchemas,
  onboarding: onboardingSchemas,
  settings: settingsSchemas,
  contact: contactSchemas,
};
