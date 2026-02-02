import { z } from 'zod';
import { addressLooseSchema } from './schemas/address';

// Common validation schemas
const FileClass = typeof File !== 'undefined' ? File : undefined;

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
  file: FileClass
    ? z.instanceof(FileClass, { message: 'Please select a valid file' })
    : z.any(),
  imageFile: FileClass
    ? z.instanceof(FileClass).refine(
        (file) => file.type.startsWith('image/'),
        'Please select an image file'
      )
    : z.any(),
  
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
    password: commonSchemas.password,
    confirmPassword: z.string(),
    agreedToTerms: commonSchemas.termsAgreement,
  }).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords must match',
    path: ['confirmPassword']
  }),
  
  useCase: z.object({
    primaryUseCase: z.enum(['messaging', 'legal_payments', 'matter_management', 'intake_forms', 'other']),
    productUsage: z.array(
      z.enum(['messaging', 'legal_payments', 'matter_management', 'intake_forms', 'other'])
    ).min(1),
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
    messages: z.object({
      push: z.boolean(),
      email: z.boolean(),
    }),
    system: z.object({
      push: z.boolean(),
      email: z.boolean(),
    }),
    payments: z.object({
      push: z.boolean(),
      email: z.boolean(),
    }),
    intakes: z.object({
      push: z.boolean(),
      email: z.boolean(),
    }),
    matters: z.object({
      push: z.boolean(),
      email: z.boolean(),
    }),
    messagesMentionsOnly: z.boolean(),
    desktopPushEnabled: z.boolean(),
    inApp: z.object({
      messages: z.boolean(),
      system: z.boolean(),
      payments: z.boolean(),
      intakes: z.boolean(),
      matters: z.boolean(),
    }),
    inAppFrequency: z.enum(['all', 'summaries_only']),
  }),
};

// Contact form schemas
export const contactSchemas = {
  contactForm: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: commonSchemas.email,
    phone: z.string()
      .optional()
      .or(z.literal(''))
      .refine(
        (val) => {
          if (!val || val === '') return true; // Empty is valid (optional field)
          return /^\+?[\d\s\-()]+$/.test(val) && val.replace(/\D/g, '').length >= 10;
        },
        'Please enter a valid phone number (at least 10 digits)'
      ),
    // Legacy location field for backward compatibility (optional string)
    location: z.string()
      .min(2, 'Location must be at least 2 characters')
      .optional()
      .or(z.literal('')),
    // New structured address field
    address: addressLooseSchema.optional(),
    opposingParty: z.string().optional(),
    description: z.string().optional(),
  }),
};

// Transformation utilities for backward compatibility
export const contactFormTransforms = {
  // Transform legacy location to structured address
  locationToAddress: (location?: string) => {
    if (!location || location.trim() === '') return undefined;
    
    return {
      address: location.trim(),
      apartment: undefined,
      city: undefined,
      state: undefined,
      postalCode: undefined,
      country: undefined,
    };
  },
  
  // Extract location from structured address (for legacy systems)
  addressToLocation: (address?: any) => {
    if (!address || typeof address !== 'object') return undefined;
    
    return address.address || undefined;
  },
  
  // Normalize contact form data to use structured address
  normalizeContactData: (data: any) => {
    const normalized = { ...data };
    
    // If we have a legacy location but no address, convert it
    if (normalized.location && !normalized.address) {
      normalized.address = contactFormTransforms.locationToAddress(normalized.location);
    }
    
    // If we have an address but no location, extract location for compatibility
    if (normalized.address && !normalized.location) {
      normalized.location = contactFormTransforms.addressToLocation(normalized.address);
    }
    
    return normalized;
  },
};

// Export all schemas
export const schemas = {
  common: commonSchemas,
  auth: authSchemas,
  onboarding: onboardingSchemas,
  settings: settingsSchemas,
  contact: contactSchemas,
};
