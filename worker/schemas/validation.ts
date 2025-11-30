import { z } from 'zod';

// Base schemas
export const idSchema = z.string().min(1);
export const emailSchema = z.string().email();
export const phoneSchema = z.string().optional();
export const timestampSchema = z.number().int().positive();

// Practice role schema (formerly organizationRoleSchema)
export const organizationRoleSchema = z.enum(['owner', 'admin', 'attorney', 'paralegal']);

// Subscription and billing schemas (handled by remote API)
export const subscriptionTierSchema = z.enum(['free', 'plus', 'business', 'enterprise']);
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
  sessionId: idSchema.optional(),
  practiceId: idSchema.optional(),
  context: z.record(z.string(), z.any()).optional()
});

export const chatResponseSchema = z.object({
  message: z.string(),
  sessionId: idSchema,
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

// Conversation config schemas (formerly organizationConfigSchema)
export const conversationConfigSchema = z.object({
  // AI fields removed - no longer used
  consultationFee: z.number().min(0).optional(),
  requiresPayment: z.boolean().optional(),
  ownerEmail: emailSchema.optional(),
  availableServices: z.array(z.string().min(1)).optional(),
  serviceQuestions: z.record(z.string(), z.array(z.string().min(1))).optional(),
  domain: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  paymentLink: z.string().url().optional(),
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
    quotaMetric: z.enum(['messages', 'files']).nullable().optional(),
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


// Legacy organization schemas - kept for backward compatibility but deprecated
// All organization management is now handled by remote API
export const organizationConfigSchema = conversationConfigSchema; // Alias for backward compatibility

// Organization database schema - DEPRECATED (organizations table removed)
export const organizationDbSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  slug: z.string().min(1),
  stripeCustomerId: stripeCustomerIdSchema,
  subscriptionTier: subscriptionTierSchema.default('free'),
  seats: seatsSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema
});

// Organization creation/update schemas - DEPRECATED (use remote API)
export const organizationCreateSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  config: conversationConfigSchema,
  stripeCustomerId: stripeCustomerIdSchema,
  subscriptionTier: subscriptionTierSchema.default('free'),
  seats: seatsSchema
});

export const organizationUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  config: conversationConfigSchema.optional(),
  stripeCustomerId: stripeCustomerIdSchema.optional(),
  subscriptionTier: subscriptionTierSchema.optional(),
  seats: seatsSchema.optional()
});

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
  sessionId: idSchema,
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional()
});



// Session schemas
export const sessionSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  messages: z.array(chatMessageSchema),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  metadata: z.record(z.string(), z.unknown()).optional()
});

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

// Legacy alias for backward compatibility
export const organizationIdQuerySchema = practiceIdQuerySchema;

// Session request body schema
export const sessionRequestBodySchema = z.object({
  practiceId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  sessionToken: z.string().min(1).optional(),
  retentionHorizonDays: z.number().int().positive().optional()
});

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

// Practice Management API Response Schemas (DEPRECATED - handled by remote API)
export const organizationMemberSchema = z.object({
  userId: z.string().min(1),
  role: organizationRoleSchema,
  email: z.string().email().nullable().optional(),
  name: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  createdAt: timestampSchema
});

export const organizationInvitationSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  organizationName: z.string().optional(),
  email: z.string().email(),
  role: organizationRoleSchema,
  status: z.enum(['pending', 'accepted', 'declined']),
  invitedBy: z.string().min(1),
  expiresAt: timestampSchema,
  createdAt: timestampSchema
});

export const practiceSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  stripeCustomerId: z.string().nullable().optional(),
  subscriptionTier: subscriptionTierSchema.nullable().optional(),
  seats: z.number().int().positive().nullable().optional(),
  conversationConfig: conversationConfigSchema.optional(),
  metadata: z.object({
    subscriptionPlan: z.string().optional(),
    planStatus: z.string().optional(),
    conversationConfig: conversationConfigSchema.optional()
  }).optional(),
  kind: z.enum(['workspace', 'practice']).optional()
});

// Legacy alias for backward compatibility
export const organizationSchema = practiceSchema;

// API Response schemas
export const membersResponseSchema = z.object({
  members: z.array(organizationMemberSchema)
});
