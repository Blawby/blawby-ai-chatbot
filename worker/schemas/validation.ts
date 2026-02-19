import { z } from 'zod';

// Base schemas
export const idSchema = z.string().min(1);
export const emailSchema = z.string().email();
export const phoneSchema = z.string().optional();
export const timestampSchema = z.number().int().positive();

// Practice role schema
export const practiceRoleSchema = z.enum(['owner', 'admin', 'attorney', 'paralegal']);

// Subscription and billing schemas (handled by remote API)
export const seatsSchema = z.number().int().positive().default(1);
export const stripeCustomerIdSchema = z.string().min(1).optional();

// Chat schemas
export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  timestamp: timestampSchema,
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().min(1)
  })).min(1),
  conversationId: idSchema.optional(),
  practiceId: idSchema.optional(),
  context: z.record(z.string(), z.any()).optional()
});

export const chatResponseSchema = z.object({
  message: z.string(),
  conversationId: idSchema,
  timestamp: timestampSchema
});

// Matter creation schemas
export const matterCreationSchema = z.object({
  practiceId: idSchema,
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  status: z.enum(['draft', 'active', 'closed']).default('draft'),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const matterUpdateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().min(1).optional(),
  status: z.enum(['draft', 'active', 'closed']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

// Conversation config schemas
export const conversationConfigSchema = z.object({
  // AI fields removed - no longer used
  ownerEmail: emailSchema.optional(),
  availableServices: z.array(z.string().min(1)).optional(),
  serviceQuestions: z.record(z.string(), z.array(z.string().min(1))).optional(),
  domain: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  introMessage: z.string().min(1).optional(),
  profileImage: z.string().url().optional(),
  voice: z.object({
    enabled: z.boolean().optional(),
    provider: z.enum(['cloudflare', 'elevenlabs', 'custom']).optional(),
    voiceId: z.string().min(1).optional().nullable(),
    displayName: z.string().min(1).optional().nullable(),
    previewUrl: z.string().url().optional().nullable()
  }).optional(),
  betterAuthOrgId: z.string().optional(),
  isPublic: z.boolean().optional(),
  tools: z.record(z.string(), z.object({
    enabled: z.boolean(),
    requiredRole: z.enum(['owner', 'admin', 'attorney', 'paralegal']).nullable().optional(),
    allowAnonymous: z.boolean().optional()
  })).optional(),
  agentMember: z.object({
    enabled: z.boolean(),
    userId: z.string().optional(),
    autoInvoke: z.boolean().optional(),
    tagRequired: z.boolean().optional()
  }).optional()
}).passthrough();

// Form schemas
export const contactFormSchema = z.object({
  practiceId: idSchema,
  email: emailSchema,
  phoneNumber: z.string().min(1),
  matterDetails: z.string().min(1),
  urgency: z.string().optional()
});



// File upload schemas
export const fileUploadSchema = z.object({
  practiceId: idSchema,
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

// Feedback schemas
export const feedbackSchema = z.object({
  practiceId: idSchema,
  conversationId: idSchema,
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional()
});



// Session schemas removed - using conversations instead
// Legacy sessionSchema kept for backward compatibility but not used

// Export schemas
export const exportRequestSchema = z.object({
  practiceId: idSchema,
  sessionId: idSchema.optional(),
  format: z.enum(['json', 'csv', 'pdf']).default('json'),
  dateRange: z.object({
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional()
  }).optional()
});

// Query parameter schemas
export const paginationSchema = z.object({
  page: z.string().transform(val => parseInt(val, 10)).pipe(z.number().int().min(1)).default(1),
  limit: z.string().transform(val => parseInt(val, 10)).pipe(z.number().int().min(1).max(100)).default(20)
});

export const practiceIdQuerySchema = z.object({
  practiceId: idSchema
});

// Session request body schema
// sessionRequestBodySchema removed - sessions endpoint removed

// Headers schemas
export const authHeadersSchema = z.object({
  authorization: z.string().regex(/^Bearer\s+/).optional()
});

export const contentTypeSchema = z.object({
  'content-type': z.string().includes('application/json')
});

// File upload headers schema
export const multipartHeadersSchema = z.object({
  'content-type': z.string().includes('multipart/form-data')
});

export const practiceSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  stripeCustomerId: z.string().nullable().optional(),
  seats: z.number().int().positive().nullable().optional(),
  conversationConfig: conversationConfigSchema.optional(),
  metadata: z.object({
    subscriptionPlan: z.string().optional(),
    planStatus: z.string().optional(),
    conversationConfig: conversationConfigSchema.optional()
  }).optional(),
  kind: z.enum(['workspace', 'practice']).optional()
});
