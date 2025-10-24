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
  
  // Birthday validation (not in future)
  birthday: z.string().refine((val) => {
    const date = new Date(val);
    const today = new Date();
    
    // Create UTC midnight timestamps for comparison
    const birthdayUTC = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    
    return !isNaN(birthdayUTC) && birthdayUTC <= todayUTC;
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
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    birthday: commonSchemas.birthday.optional(),
    agreedToTerms: commonSchemas.termsAgreement,
  }),
  
  useCase: z.object({
    selectedUseCases: z.array(z.enum(['personal', 'business', 'research', 'documents', 'other'])).min(1, 'Please select at least one use case'),
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

// Organization/Practice schemas
export const organizationSchemas = {
  createOrganization: z.object({
    name: z.string().min(1, 'Organization name is required').max(100, 'Name must be less than 100 characters'),
    slug: z.string().optional().refine(
      (val) => val === undefined || val === '' || /^[a-z0-9-]+$/.test(val),
      'Slug must contain only lowercase letters, numbers, and hyphens'
    ),
    description: z.string().optional(),
    businessPhone: z.string().optional().refine(
      (val) => {
        if (val === undefined || val === '') return true;
        const matchesPattern = /^\+?[\d\s-()]+$/.test(val);
        const digitCount = val.replace(/\D/g, '').length;
        return matchesPattern && digitCount >= 7;
      },
      'Invalid phone format (minimum 7 digits required)'
    ),
    businessEmail: z.string().optional().refine(
      (val) => val === undefined || val === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
      'Invalid email format'
    ),
    consultationFee: z.string().optional().refine(
      (val) => {
        if (val === undefined || val === '') return true;
        // Accept flexible currency formats: with/without $, commas, periods
        const flexiblePattern = /^[\$]?[\d,]+(\.\d{1,2})?$/;
        return flexiblePattern.test(val);
      },
      'Invalid fee format (accepts numbers with optional $, commas, and decimals)'
    ),
    paymentUrl: z.string().optional().refine(
      (val) => val === undefined || val === '' || commonSchemas.url.safeParse(val).success,
      'Invalid URL format'
    ),
    calendlyUrl: z.string().optional().refine(
      (val) => val === undefined || val === '' || commonSchemas.url.safeParse(val).success,
      'Invalid URL format'
    ),
  }),
  
  updateOrganization: z.object({
    name: z.string().min(1, 'Organization name is required').max(100, 'Name must be less than 100 characters').optional(),
    description: z.string().optional(),
    businessPhone: z.string().optional().refine(
      (val) => {
        if (val === undefined || val === '') return true;
        const matchesPattern = /^\+?[\d\s-()]+$/.test(val);
        const digitCount = val.replace(/\D/g, '').length;
        return matchesPattern && digitCount >= 7;
      },
      'Invalid phone format (minimum 7 digits required)'
    ),
    businessEmail: z.string().optional().refine(
      (val) => val === undefined || val === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
      'Invalid email format'
    ),
    consultationFee: z.string().optional().refine(
      (val) => {
        if (val === undefined || val === '') return true;
        // Accept flexible currency formats: with/without $, commas, periods
        const flexiblePattern = /^[\$]?[\d,]+(\.\d{1,2})?$/;
        return flexiblePattern.test(val);
      },
      'Invalid fee format (accepts numbers with optional $, commas, and decimals)'
    ),
    paymentUrl: z.string().optional().refine(
      (val) => val === undefined || val === '' || commonSchemas.url.safeParse(val).success,
      'Invalid URL format'
    ),
    calendlyUrl: z.string().optional().refine(
      (val) => val === undefined || val === '' || commonSchemas.url.safeParse(val).success,
      'Invalid URL format'
    ),
  }),
};

// Export all schemas
export const schemas = {
  common: commonSchemas,
  auth: authSchemas,
  onboarding: onboardingSchemas,
  settings: settingsSchemas,
  contact: contactSchemas,
  organization: organizationSchemas,
};
