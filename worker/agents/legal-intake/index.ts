import type { Env, AgentMessage, AgentResponse, FileAttachment } from '../../types.js';
import { TeamService, type Team } from '../../services/TeamService.js';
import { ConversationContextManager } from '../../middleware/conversationContextManager.js';
import { Logger } from '../../utils/logger.js';
import { ToolCallParser } from '../../utils/toolCallParser.js';
import { withAIRetry } from '../../utils/retry.js';
import { ToolUsageMonitor } from '../../utils/toolUsageMonitor.js';
import { safeIncludes } from '../../utils/safeStringUtils.js';
import { ValidationService } from '../../services/ValidationService.js';
import { PaymentServiceFactory } from '../../services/PaymentServiceFactory.js';
import { ContactIntakeOrchestrator } from '../../services/ContactIntakeOrchestrator.js';
import { createValidationError, createSuccessResponse } from '../../utils/responseUtils.js';
import { chunkResponseText } from '../../utils/streaming.js';
import { createSuccessResult, createErrorResult, ValidationError } from './errors.js';
import { LegalIntakeLogger, LegalIntakeOperation } from './legalIntakeLogger.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const AI_MODEL_CONFIG = {
  model: '@cf/meta/llama-3.1-8b-instruct',
  maxTokens: 500,
  temperature: 0.1
} as const;

const MATTER_TYPES = [
  'Family Law', 'Employment Law', 'Landlord/Tenant', 'Personal Injury',
  'Business Law', 'Criminal Law', 'Civil Law', 'Contract Review',
  'Property Law', 'Administrative Law', 'General Consultation'
] as const;

const COMPLEXITY_LEVELS = ['Low', 'Medium', 'High', 'Very High'] as const;


const DETECTION_THRESHOLDS = {
  MIN_SCORE: 0.1,
  MIN_CONFIDENCE: 0.3,
  SENSITIVE_KEYWORD_COUNT: 2,
  MIN_CONFIDENCE_FOR_MATTER: 0.6,
  MIN_CONFIDENCE_FOR_QUALIFIED: 0.5
} as const;

const CACHE_CONFIG = {
  TTL_MS: 5 * 60 * 1000, // 5 minutes
  MAX_SIZE: 100
} as const;

const PUBLIC_TEAM_IDS = new Set(['blawby-ai']);

// Pattern compilation - done once
const PATTERNS = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  name: /(?:my name is|i'm|i am|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
  nameField: /name\s*[:=]\s*([A-Za-z][A-Za-z\s'-]{1,50})/gi,
  opposingParty: /(?:opposing|against|versus|vs\.?)\s+((?:[A-Z][a-z]+\s*){1,3})/gi,
  toolCallLegacy: /^TOOL_CALL:\s*(\w+)/i,
  toolCallJson: /^\s*\{\s*"name"\s*:\s*"(\w+)"/
} as const;

const LEGAL_PATTERNS = {
  'Family Law': {
    keywords: ['divorce', 'custody', 'child support', 'family dispute', 'paternity', 'alimony', 'spousal support', 'domestic violence'],
    weight: 1.0
  },
  'Employment Law': {
    keywords: ['fired', 'wrongful termination', 'workplace discrimination', 'workplace harassment', 'unpaid wages', 'overtime pay', 'employment contract'],
    weight: 1.0
  },
  'Personal Injury': {
    keywords: ['accident', 'injured', 'car crash', 'personal injury', 'negligence', 'slip and fall', 'medical malpractice'],
    weight: 1.0
  },
  'Landlord/Tenant': {
    keywords: ['eviction', 'rent', 'landlord', 'tenant', 'lease', 'security deposit', 'rental agreement'],
    weight: 1.0
  },
  'Criminal Law': {
    keywords: ['arrested', 'charged', 'dui', 'criminal', 'trial', 'criminal defense'],
    weight: 1.2
  },
  'Business Law': {
    keywords: ['business contract', 'partnership', 'corporate', 'llc', 'corporation', 'business formation'],
    weight: 1.0
  },
  'Contract Review': {
    keywords: ['contract review', 'agreement review', 'terms', 'legal document'],
    weight: 0.9
  },
  'Property Law': {
    keywords: ['real estate', 'deed', 'title', 'property dispute'],
    weight: 1.0
  }
} as const;

const SENSITIVE_KEYWORDS = [
  'criminal', 'arrest', 'jail', 'prison', 'charges', 'accident', 'injury',
  'death', 'fatal', 'domestic violence', 'abuse', 'harassment', 'threat',
  'danger', 'emergency', 'urgent', 'immediate'
] as const;

const GENERAL_INQUIRY_PATTERNS = [
  'services in my area', 'pricing', 'what services', 'do you provide',
  'concerned about cost', 'not sure what kind'
] as const;

const URGENCY_KEYWORDS = {
  high: ['urgent', 'emergency', 'asap', 'right now', 'immediately'],
  medium: ['soon', 'quickly', 'time-sensitive'],
  low: ['eventually', 'when possible', 'no rush']
} as const;

const PLACEHOLDER_PATTERNS = /client|user|placeholder|example|test|xxx|n\/a|tbd/i;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type MatterType = typeof MATTER_TYPES[number];
export type ComplexityLevel = typeof COMPLEXITY_LEVELS[number];

export enum Currency {
  USD = 'USD',
  CAD = 'CAD',
  EUR = 'EUR',
  GBP = 'GBP'
}

export type ISODateString = string & { __isoDate: true };

export enum ConversationState {
  INITIAL = 'INITIAL',
  GATHERING_INFORMATION = 'GATHERING_INFORMATION',
  QUALIFYING_LEAD = 'QUALIFYING_LEAD',
  SHOWING_CONTACT_FORM = 'SHOWING_CONTACT_FORM',
  READY_TO_CREATE_MATTER = 'READY_TO_CREATE_MATTER',
  CREATING_MATTER = 'CREATING_MATTER',
  COMPLETED = 'COMPLETED'
}

export interface Recipient {
  readonly email: string;
  readonly name: string;
}

export interface ContactFormField {
  readonly required: boolean;
  readonly label: string;
}

export interface ContactFormFields {
  readonly name: ContactFormField;
  readonly email: ContactFormField;
  readonly phone: ContactFormField;
  readonly location: ContactFormField;
  readonly opposing_party: ContactFormField;
  readonly message: ContactFormField;
}

export interface ContactFormData {
  readonly reason: string;
  readonly fields: ContactFormFields;
  readonly submitText: string;
  readonly initialValues?: {
    readonly name?: string;
    readonly email?: string;
    readonly phone?: string;
    readonly location?: string;
    readonly opposingParty?: string;
  };
}

export interface ContactFormParameters {
  readonly reason?: string;
  readonly name?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly location?: string;
  readonly message?: string;
}

export interface ContactFormResponse {
  readonly success: boolean;
  readonly action: string;
  readonly message: string;
  readonly contactForm: ContactFormData;
}

export interface ConversationContext {
  hasLegalIssue: boolean;
  hasOpposingParty: boolean;
  legalIssueType: string | null;
  description: string | null;
  opposingParty: string | null;
  isSensitiveMatter: boolean;
  isGeneralInquiry: boolean;
  shouldCreateMatter: boolean;
  state: ConversationState;
  hasAskedUrgency: boolean;
  urgencyLevel: string | null;
  hasAskedTimeline: boolean;
  timeline: string | null;
  hasAskedBudget: boolean;
  budget: string | null;
  hasAskedPreviousLawyer: boolean;
  hasPreviousLawyer: boolean | null;
  isQualifiedLead: boolean;
  safetyFlags?: string[];
  userIntent?: 'intake' | 'lawyer_contact' | 'general_info' | 'unclear' | 'skip_to_lawyer';
  conversationPhase?: 'initial' | 'gathering_info' | 'qualifying' | 'contact_collection' | 'completed' | 'showing_contact_form';
  confidence?: number;
  contactInfo?: {
    name: string | null;
    email: string | null;
    phone: string | null;
  };
}

export interface CreateMatterParams {
  readonly matter_type: MatterType;
  readonly description: string;
  readonly name: string;
  readonly phone?: string;
  readonly email?: string;
  readonly location?: string;
  readonly opposing_party?: string;
}

export interface RequestLawyerReviewParams {
  readonly matter_type: MatterType;
  readonly complexity?: ComplexityLevel;
}


export interface CreatePaymentInvoiceParams {
  readonly invoice_id: string;
  readonly amount: number;
  readonly currency: Currency;
  readonly recipient: Recipient;
  readonly due_date?: ISODateString;
  readonly description: string;
}

export interface ToolParameterProperty {
  readonly type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  readonly description: string;
  readonly enum?: readonly string[];
  readonly pattern?: string;
  readonly default?: string | number | boolean;
  readonly maxLength?: number;
  readonly minLength?: number;
  readonly maximum?: number;
  readonly minimum?: number;
  readonly items?: ToolParameterProperty;
  readonly properties?: Record<string, ToolParameterProperty>;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: {
    readonly type: 'object';
    readonly properties: Record<string, ToolParameterProperty>;
    readonly required: readonly string[];
    readonly additionalProperties?: boolean;
  };
}

export interface CloudflareLocation {
  readonly city?: string;
  readonly country?: string;
  readonly region?: string;
  readonly timezone?: string;
}

interface ExtractedContactInfo {
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface ToolCall {
  name: string;
  arguments?: Record<string, unknown>;
}

type ToolResult = {
  success: boolean;
  data?: unknown;
  message?: string;
  error?: { message: string; toUserResponse?: () => string };
};

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const createMatter: ToolDefinition = {
  name: 'create_matter',
  description: 'Create a new legal matter with all required information. ONLY use this tool AFTER the user has submitted the contact form and you have all their contact details.',
  parameters: {
    type: 'object',
    properties: {
      matter_type: { type: 'string', description: 'Type of legal matter', enum: MATTER_TYPES },
      description: { type: 'string', description: 'Brief description of the legal issue', maxLength: 1000 },
      name: { type: 'string', description: 'Client full name', minLength: 2, maxLength: 100 },
      phone: { type: 'string', description: 'Client phone number', pattern: '^[\\+]?[1-9][\\d\\s\\-\\(\\)]{7,15}$' },
      email: { type: 'string', description: 'Client email address', pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$' },
      location: { type: 'string', description: 'Client location (city and state)', maxLength: 100 },
      opposing_party: { type: 'string', description: 'Opposing party name if applicable', maxLength: 100 }
    },
    required: ['matter_type', 'description', 'name'] as const,
    additionalProperties: false
  }
};

const showContactForm: ToolDefinition = {
  name: 'show_contact_form',
  description: 'CRITICAL: ONLY use this tool AFTER you have had a full conversation, qualified the lead, and determined they are serious about legal action.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false
  }
};

const requestLawyerReview: ToolDefinition = {
  name: 'request_lawyer_review',
  description: 'Request lawyer review for complex matters',
  parameters: {
    type: 'object',
    properties: {
      matter_type: { type: 'string', description: 'Type of legal matter', enum: MATTER_TYPES },
      complexity: { type: 'string', description: 'Matter complexity level', enum: COMPLEXITY_LEVELS, default: 'Medium' }
    },
    required: ['matter_type'] as const,
    additionalProperties: false
  }
};


const createPaymentInvoice: ToolDefinition = {
  name: 'create_payment_invoice',
  description: 'Create a payment invoice for consultation or legal services',
  parameters: {
    type: 'object',
    properties: {
      invoice_id: { type: 'string', description: 'Unique identifier for the invoice', pattern: '^[a-zA-Z0-9\\-_]+$', minLength: 1, maxLength: 50 },
      amount: { type: 'number', description: 'Invoice amount in cents (e.g., 7500 for $75.00)', minimum: 100, maximum: 1000000 },
      currency: { type: 'string', description: 'Currency code for the invoice', enum: Object.values(Currency), default: Currency.USD },
      recipient: { type: 'object', description: 'Recipient information for the invoice', properties: { email: { type: 'string', description: 'Recipient email address', maxLength: 255 }, name: { type: 'string', description: 'Recipient full name', minLength: 1, maxLength: 255 } } },
      due_date: { type: 'string', description: 'Invoice due date in ISO 8601 format (YYYY-MM-DD)', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      description: { type: 'string', description: 'Description of services or consultation', minLength: 1, maxLength: 500 }
    },
    required: ['invoice_id', 'amount', 'currency', 'recipient', 'description'] as const,
    additionalProperties: false
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function isPublicMode(teamId?: string | null): boolean {
  return !teamId || PUBLIC_TEAM_IDS.has(teamId);
}

function hasPlaceholderValue(value: string | undefined | null): boolean {
  if (!value) return false;
  return PLACEHOLDER_PATTERNS.test(value);
}


// ============================================================================
// TEAM CONFIG CACHE
// ============================================================================

class TeamCache {
  private cache = new Map<string, { team: Team; timestamp: number }>();

  async get(teamId: string, env: Env): Promise<Team | null> {
    const cached = this.cache.get(teamId);
    if (cached && Date.now() - cached.timestamp < CACHE_CONFIG.TTL_MS) {
      return cached.team;
    }

    try {
      const teamService = new TeamService(env);
      const team = await teamService.getTeam(teamId);
      
      if (team) {
        this.cache.set(teamId, { team, timestamp: Date.now() });
        
        // Cleanup old entries
        if (this.cache.size > CACHE_CONFIG.MAX_SIZE) {
          const oldestKey = Array.from(this.cache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
          this.cache.delete(oldestKey);
        }
      }
      
      return team;
    } catch (error) {
      Logger.error('Failed to retrieve team configuration', { 
        teamId, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return null;
    }
  }
}

const teamCache = new TeamCache();

// ============================================================================
// CONTEXT DETECTION
// ============================================================================

class ContextDetector {
  static extractContactInfo(text: string): ExtractedContactInfo {
    const emailMatch = text.match(PATTERNS.email);
    const email = emailMatch?.[0] ?? null;
    
    const phoneMatch = text.match(PATTERNS.phone);
    const phone = phoneMatch?.[0] ?? null;
    
    let name: string | null = null;
    
    const nameIntroMatch = [...text.matchAll(PATTERNS.name)];
    if (nameIntroMatch.length > 0) {
      name = nameIntroMatch[0][1].trim();
    }
    
    if (!name) {
      const nameFieldMatch = [...text.matchAll(PATTERNS.nameField)];
      if (nameFieldMatch.length > 0) {
        name = nameFieldMatch[0][1].trim();
      }
    }
    
    return { name, email, phone };
  }

  static calculateUrgency(lowerText: string): 'high' | 'medium' | 'low' | null {
    for (const [level, keywords] of Object.entries(URGENCY_KEYWORDS)) {
      if (keywords.some(kw => lowerText.includes(kw))) {
        return level as 'high' | 'medium' | 'low';
      }
    }
    return null;
  }

  static detectContext(conversationText: string): ConversationContext {
    const lowerText = conversationText.toLowerCase();
    const wordCount = lowerText.split(/\s+/).length;
    
    const categoryScores = new Map<string, number>();
    
    for (const [category, config] of Object.entries(LEGAL_PATTERNS)) {
      let score = 0;
      for (const keyword of config.keywords) {
        if (lowerText.includes(keyword)) {
          score += config.weight;
        }
      }
      const normalizedScore = score / Math.log(wordCount + 2);
      categoryScores.set(category, normalizedScore);
    }
    
    let legalIssueType: string | null = null;
    let maxScore = 0;
    let secondMaxScore = 0;
    
    for (const [category, score] of categoryScores.entries()) {
      if (score > maxScore) {
        secondMaxScore = maxScore;
        maxScore = score;
        legalIssueType = category;
      } else if (score > secondMaxScore) {
        secondMaxScore = score;
      }
    }
    
    const confidence = maxScore > 0 
      ? Math.min(1.0, (maxScore - secondMaxScore) / maxScore) 
      : 0;
    
    if (maxScore < DETECTION_THRESHOLDS.MIN_SCORE || 
        confidence < DETECTION_THRESHOLDS.MIN_CONFIDENCE) {
      legalIssueType = null;
    }
    
    const contactInfo = this.extractContactInfo(conversationText);
    
    const opposingPartyMatches = [...conversationText.matchAll(PATTERNS.opposingParty)];
    const opposingParty = opposingPartyMatches.length > 0 
      ? opposingPartyMatches[0][1].trim() 
      : null;
    
    const sensitiveScore = SENSITIVE_KEYWORDS.filter(kw => 
      lowerText.includes(kw)
    ).length;
    const isSensitiveMatter = sensitiveScore >= DETECTION_THRESHOLDS.SENSITIVE_KEYWORD_COUNT;
    
    const isGeneralInquiry = GENERAL_INQUIRY_PATTERNS.some(pattern => 
      lowerText.includes(pattern)
    );
    
    const urgencyLevel = this.calculateUrgency(lowerText);
    const hasUrgency = urgencyLevel !== null;
    const hasTimeline = ['timeline', 'when', 'how long', 'deadline'].some(w => 
      lowerText.includes(w)
    );
    const hasBudget = ['cost', 'price', 'fee', 'budget', 'afford'].some(w => 
      lowerText.includes(w)
    );
    const hasPreviousLawyer = ['other lawyer', 'previous attorney', 'consulted'].some(w => 
      lowerText.includes(w)
    );
    
    const isQualifiedLead = !!(
      legalIssueType && 
      confidence > DETECTION_THRESHOLDS.MIN_CONFIDENCE_FOR_QUALIFIED &&
      (hasUrgency || hasTimeline) && 
      !hasPreviousLawyer
    );
    
    const hasContactInfo = !!(contactInfo.name && (contactInfo.email || contactInfo.phone));
    let state = ConversationState.GATHERING_INFORMATION;
    
    if (legalIssueType) {
      if (hasContactInfo) {
        state = ConversationState.READY_TO_CREATE_MATTER;
      } else {
        state = ConversationState.QUALIFYING_LEAD;
      }
    }
    
    return {
      hasLegalIssue: !!legalIssueType,
      hasOpposingParty: !!opposingParty,
      legalIssueType,
      description: legalIssueType 
        ? `Client seeking help with ${legalIssueType.toLowerCase()}` 
        : null,
      opposingParty,
      isSensitiveMatter,
      isGeneralInquiry,
      shouldCreateMatter: !!(legalIssueType && hasContactInfo && 
        confidence > DETECTION_THRESHOLDS.MIN_CONFIDENCE_FOR_MATTER),
      state,
      hasAskedUrgency: hasUrgency,
      urgencyLevel,
      hasAskedTimeline: hasTimeline,
      timeline: hasTimeline ? 'Timeline mentioned' : null,
      hasAskedBudget: hasBudget,
      budget: hasBudget ? 'Budget discussed' : null,
      hasAskedPreviousLawyer: hasPreviousLawyer,
      hasPreviousLawyer: hasPreviousLawyer || null,
      isQualifiedLead,
      confidence,
      contactInfo
    };
  }
}

// ============================================================================
// PROMPT BUILDER
// ============================================================================

class PromptBuilder {
  static build(context: ConversationContext, team: Team | null, teamId?: string | null): string {
    const teamName = team?.name || 'our law firm';
    const publicMode = isPublicMode(teamId);
    const requiresLocation = team?.config?.jurisdiction?.type === 'state';
    
    const locationRequirement = requiresLocation ? 
      `\nIMPORTANT: This team requires location information (city and state) before proceeding with contact forms or matter creation. Always ask for location first if not provided.` : '';
    
    const hasLocationFlag = context.safetyFlags?.includes('location_required');
    const locationFlagMessage = hasLocationFlag ? 
      `\nURGENT: The user's location is required before proceeding. Ask for their city and state immediately.` : '';
    
    const isSkipToLawyer = context.userIntent === 'skip_to_lawyer' || 
                           context.conversationPhase === 'showing_contact_form';
    const skipToLawyerMessage = isSkipToLawyer ? 
      `\nURGENT: The user wants to skip the intake process and contact the legal team directly. You MUST immediately show the contact form using the show_contact_form tool.` : '';
    
    const styleGuidance = publicMode
      ? `- Keep responses to three short sentences or fewer.
- Give the user one clear next step and reference existing checklists or PDFs instead of describing them in detail.
- Avoid repeating prior details unless the user asks.`
      : `- Confirm missing key facts in no more than two follow-up questions.
- Transition to the contact form or explain precisely what is still needed instead of rehashing prior guidance.
- Keep answers crisp and professional; avoid script-style introductions.`;
    
    return `You are a legal intake specialist for ${teamName}.
Current situation: ${context.legalIssueType ? `Client has ${context.legalIssueType} issue` : 'Gathering information'}${locationRequirement}${locationFlagMessage}${skipToLawyerMessage}
Available tools: create_matter, show_contact_form, request_lawyer_review, create_payment_invoice

Rules:
- CRITICAL: Use create_matter ONLY when you have ACTUAL values for: name + legal issue + contact info${requiresLocation ? ' + location' : ''}
- If ANY field would use a placeholder like "Client Name", "Client Location", STOP and use show_contact_form instead
- Use show_contact_form when user agrees to create matter but is missing name, email, phone, or location
- Use show_contact_form ONLY after qualifying the lead with questions about urgency, timeline, and seriousness
- IMPORTANT: For informational questions about legal topics, provide helpful explanations directly without using tools
- Only use tools when the user is ready to take action (create matter, contact form, etc.)
- DO NOT use tools for general questions about legal processes, consultations, or explanations
- Answer informational questions conversationally without calling any tools

DECISION TREE:
1. Do you have the user's actual name (not "Client Name")? If NO → use show_contact_form
2. Do you have the user's actual email and phone? If NO → use show_contact_form  
3. Do you have the user's actual location${requiresLocation ? ' (not "Client Location")' : ''}? If NO → use show_contact_form
4. Only if you have ALL actual values → use create_matter

- Always start by briefly reflecting the user's latest concern so they know you understood (e.g., "I'm sorry you were fired").
- Be concise and skip pleasantries; respond to the user's latest question directly
- Let middleware-driven UI (case drafts, checklists, PDFs) speak for itself—mention them briefly rather than describing their contents
- Only show contact form when user explicitly asks to skip intake or contact the team directly
- For employment law issues, ask specific questions like: "When were you fired?", "What reason was given?", "Do you have any documentation?"
- When you don't yet have contact information, collect at least two concrete qualifiers (e.g., reason, timeline, urgency) before moving on.

${styleGuidance}

Tool calling format:
TOOL_CALL: tool_name
PARAMETERS: {valid JSON}

CRITICAL: When calling a tool, output ONLY the tool call format above. 
Do NOT include any explanatory text before or after the tool call.
Do NOT say things like "I'll call the tool" or "Here's the function call".
Output the tool call format directly with no preamble.

Example tool calls:
TOOL_CALL: show_contact_form
PARAMETERS: {}

TOOL_CALL: create_matter
PARAMETERS: {"name": "John Doe", "matter_type": "Family Law", "description": "Divorce and child custody case", "email": "john@example.com", "phone": "555-123-4567"${requiresLocation ? ', "location": "Raleigh, NC"' : ''}}

NEVER DO THIS - These are WRONG examples:
TOOL_CALL: create_matter
PARAMETERS: {"name": "Client Name", "matter_type": "Family Law", "description": "Divorce case", "email": "user@example.com", "phone": "555-123-4567"}

Be empathetic and professional. Focus on understanding the client's legal needs and gathering necessary information.

REMEMBER: If the user is asking for information, explanations, or general questions about legal topics, respond conversationally without using any tools. Only use tools when the user wants to take specific actions like creating a matter or filling out a contact form.`;
  }
}

// ============================================================================
// TOOL CALL DETECTION
// ============================================================================

class ToolCallDetector {
  static detect(response: string): ToolCall | null {
    if (!response || typeof response !== 'string') {
      return null;
    }

    const lower = response.toLowerCase();
    
    // Check for TOOL_CALL: format
    if (safeIncludes(lower, 'tool_call')) {
      return this.parseLegacyFormat(response);
    }
    
    // Check for JSON format with "name" and "arguments"
    if (lower.includes('"name"') && lower.includes('"arguments"')) {
      return this.parseJsonFormat(response);
    }
    
    // Check if starts with JSON object
    const trimmed = response.trim();
    if (trimmed.startsWith('{') && safeIncludes(lower, '"name"')) {
      return this.parseJsonFormat(response);
    }
    
    return null;
  }

  private static parseLegacyFormat(response: string): ToolCall | null {
    const parseResult = ToolCallParser.parseToolCall(response);
    if (parseResult.success && parseResult.toolCall) {
      return {
        name: parseResult.toolCall.toolName,
        arguments: parseResult.toolCall.parameters
      };
    }
    return null;
  }

  private static parseJsonFormat(response: string): ToolCall | null {
    try {
      // Find the first opening brace
      const firstBraceIndex = response.indexOf('{');
      if (firstBraceIndex === -1) {
        return null;
      }

      // Use brace-balancing to find the complete JSON object
      let braceCount = 0;
      let endIndex = -1;
      
      for (let i = firstBraceIndex; i < response.length; i++) {
        const char = response[i];
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            endIndex = i;
            break;
          }
        }
      }

      // If we didn't find a matching closing brace, return null
      if (endIndex === -1) {
        return null;
      }

      // Extract the JSON substring and parse it
      const jsonString = response.substring(firstBraceIndex, endIndex + 1);
      const parsed = JSON.parse(jsonString);
      
      if (parsed.name && typeof parsed.name === 'string') {
        return {
          name: parsed.name,
          arguments: parsed.arguments || {}
        };
      }
    } catch {
      // Not valid JSON
    }
    return null;
  }
}

// ============================================================================
// SSE STREAMING UTILITIES
// ============================================================================

const STREAM_TOKEN_DELAY_MS = 15;

class SSEController {
  constructor(
    private controller?: ReadableStreamDefaultController<Uint8Array>
  ) {}

  async emit(event: unknown): Promise<void> {
    if (!this.controller) return;
    
    try {
      const eventData = `data: ${JSON.stringify(event)}\n\n`;
      this.controller.enqueue(new TextEncoder().encode(eventData));
    } catch (error) {
      Logger.warn('Failed to emit SSE event', { 
        event: (event as Record<string, unknown>)?.type, 
        error 
      });
    }
  }

  async complete(): Promise<void> {
    await this.emit({ type: 'complete' });
    
    if (this.controller) {
      try {
        this.controller.close();
      } catch {
        Logger.debug('Controller already closed or closing');
      }
    }
  }

  async error(error: unknown, correlationId: string): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await this.emit({
      type: 'error',
      message: errorMessage,
      correlationId
    });
  }

  async text(text: string): Promise<void> {
    if (typeof text !== 'string' || text.length === 0) {
      return;
    }

    await this.emit({ type: 'text', text });
  }

  async final(response: string, extra: Record<string, unknown> = {}): Promise<void> {
    const safeResponse = typeof response === 'string' && response.trim().length > 0
      ? response
      : 'I apologize, but I encountered an error processing your request.';

    await this.emit({
      type: 'final',
      response: safeResponse,
      ...extra
    });
  }
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise(resolve => setTimeout(resolve, ms));
}

function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return Boolean(value && typeof (value as ReadableStream<Uint8Array>).getReader === 'function');
}

function normalizeToolCallArguments(args: unknown): Record<string, unknown> | undefined {
  if (!args) {
    return undefined;
  }

  if (typeof args === 'string') {
    const trimmed = args.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : { value: parsed };
    } catch (_) {
      return { raw: trimmed };
    }
  }

  if (typeof args === 'object') {
    return args as Record<string, unknown>;
  }

  return { value: args } as Record<string, unknown>;
}

function normalizeToolCall(call: any): ToolCall | null {
  if (!call) {
    return null;
  }

  const fn = call.function ?? call;
  const name = call.name ?? fn?.name;
  if (!name || typeof name !== 'string') {
    return null;
  }

  const args = call.arguments ?? fn?.arguments;
  const normalizedArgs = normalizeToolCallArguments(args);

  return {
    name,
    arguments: normalizedArgs
  };
}

type ToolCallAccumulator = Map<string, { name?: string; arguments?: string }>;

function accumulateToolCallDelta(payload: any, accumulator: ToolCallAccumulator): void {
  const choices = payload?.response?.choices ?? payload?.choices;
  if (!Array.isArray(choices)) {
    return;
  }

  for (const choice of choices) {
    const deltas = choice?.delta?.tool_calls ?? choice?.delta?.function_call ? [choice.delta] : [];
    if (!Array.isArray(deltas) || deltas.length === 0) {
      continue;
    }

    for (const delta of deltas) {
      if (!delta) continue;
      const identifier = delta.id ?? delta.tool_call_id ?? String(delta.index ?? 0);
      const fn = delta.function ?? delta;
      const existing = accumulator.get(identifier) ?? {};

      if (fn?.name && typeof fn.name === 'string') {
        existing.name = fn.name;
      }

      if (typeof fn?.arguments === 'string') {
        existing.arguments = (existing.arguments || '') + fn.arguments;
      }

      accumulator.set(identifier, existing);
    }
  }
}

function extractDirectToolCalls(payload: any): ToolCall[] {
  const directSources = [
    payload?.response?.tool_calls,
    payload?.tool_calls,
    payload?.response?.choices?.[0]?.message?.tool_calls,
    payload?.choices?.[0]?.message?.tool_calls
  ];

  for (const source of directSources) {
    if (Array.isArray(source) && source.length > 0) {
      return source
        .map(normalizeToolCall)
        .filter((call): call is ToolCall => Boolean(call));
    }
  }

  return [];
}

function finalizeAccumulatedToolCalls(accumulator: ToolCallAccumulator): ToolCall[] {
  const finalized: ToolCall[] = [];

  for (const entry of accumulator.values()) {
    if (!entry.name) continue;
    finalized.push({
      name: entry.name,
      arguments: normalizeToolCallArguments(entry.arguments)
    });
  }

  return finalized;
}

function extractTextFromPayload(payload: any): string {
  if (!payload) {
    return '';
  }

  if (typeof payload === 'string') {
    return payload;
  }

  if (typeof payload.response === 'string') {
    return payload.response;
  }

  const directText = payload?.response?.text ?? payload?.text ?? payload?.delta?.content;
  if (typeof directText === 'string') {
    return directText;
  }

  const choices = payload?.response?.choices ?? payload?.choices;
  if (Array.isArray(choices)) {
    const textFragments: string[] = [];
    for (const choice of choices) {
      if (!choice) continue;

      if (typeof choice.text === 'string') {
        textFragments.push(choice.text);
      }

      const deltaContent = choice.delta?.content;
      if (typeof deltaContent === 'string') {
        textFragments.push(deltaContent);
      } else if (Array.isArray(deltaContent)) {
        for (const item of deltaContent) {
          if (typeof item === 'string') {
            textFragments.push(item);
          } else if (item?.type === 'output_text_delta' && typeof item.text === 'string') {
            textFragments.push(item.text);
          } else if (item?.type === 'text' && typeof item.text === 'string') {
            textFragments.push(item.text);
          }
        }
      }

      const messageContent = choice.message?.content;
      if (Array.isArray(messageContent)) {
        for (const part of messageContent) {
          if (part?.type === 'text' && typeof part.text === 'string') {
            textFragments.push(part.text);
          }
        }
      } else if (typeof messageContent === 'string') {
        textFragments.push(messageContent);
      }
    }

    if (textFragments.length > 0) {
      return textFragments.join('');
    }
  }

  const delta = payload?.delta;
  if (delta) {
    if (typeof delta === 'string') {
      return delta;
    }
    if (typeof delta?.content === 'string') {
      return delta.content;
    }
    if (Array.isArray(delta?.content)) {
      return delta.content
        .map((item: any) => (typeof item === 'string' ? item : item?.text ?? ''))
        .filter(Boolean)
        .join('');
    }
  }

  return '';
}

async function consumeAIStream(
  stream: ReadableStream<Uint8Array>,
  sse: SSEController
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const accumulator: ToolCallAccumulator = new Map();

  let buffer = '';
  let fullText = '';
  let toolCalls: ToolCall[] = [];

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        const dataLines = event.split('\n').filter(line => line.startsWith('data:'));
        if (dataLines.length === 0) {
          continue;
        }

        const payloadString = dataLines.map(line => line.slice(6)).join('\n').trim();
        if (!payloadString || payloadString === '[DONE]') {
          continue;
        }

        let payload: any;
        try {
          payload = JSON.parse(payloadString);
        } catch (_error) {
          continue;
        }

        const textDelta = extractTextFromPayload(payload);
        if (textDelta) {
          fullText += textDelta;
          await sse.text(textDelta);
          await sleep(STREAM_TOKEN_DELAY_MS);
        }

        const directCalls = extractDirectToolCalls(payload);
        if (directCalls.length > 0) {
          toolCalls = directCalls;
        } else {
          accumulateToolCallDelta(payload, accumulator);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (buffer.trim().length > 0) {
    try {
      const payload = JSON.parse(buffer.replace(/^data:\s*/, '').trim());
      const textDelta = extractTextFromPayload(payload);
      if (textDelta) {
        fullText += textDelta;
        await sse.text(textDelta);
      }

      const directCalls = extractDirectToolCalls(payload);
      if (directCalls.length > 0) {
        toolCalls = directCalls;
      } else {
        accumulateToolCallDelta(payload, accumulator);
      }
    } catch (_error) {
      // Ignore trailing parse errors
    }
  }

  if (toolCalls.length === 0) {
    toolCalls = finalizeAccumulatedToolCalls(accumulator);
  }

  return { text: fullText, toolCalls };
}

// ============================================================================
// TOOL EXECUTION
// ============================================================================

class ToolExecutor {
  constructor(
    private env: Env,
    private team: Team | null,
    private sse: SSEController,
    private correlationId: string,
    private sessionId?: string,
    private teamId?: string
  ) {}

  async execute(toolCall: ToolCall): Promise<void> {
    // Pre-flight check for placeholder values
    if (toolCall.name === 'create_matter') {
      if (this.hasPlaceholders(toolCall.arguments || {})) {
        Logger.warn('Detected placeholder values, redirecting to contact form', {
          parameters: toolCall.arguments,
          correlationId: this.correlationId,
          sessionId: this.sessionId,
          teamId: this.teamId
        });
        
        toolCall = { name: 'show_contact_form', arguments: {} };
      }
    }

    await this.sse.emit({
      type: 'tool_call',
      name: toolCall.name,
      parameters: toolCall.arguments
    });

    const handler = TOOL_HANDLERS[toolCall.name as keyof typeof TOOL_HANDLERS];
    if (!handler) {
      Logger.warn(`Unknown tool: ${toolCall.name}`);
      LegalIntakeLogger.logToolCall(
        this.correlationId,
        this.sessionId,
        this.teamId,
        LegalIntakeOperation.TOOL_CALL_FAILED,
        toolCall.name,
        toolCall.arguments,
        undefined,
        new Error(`Unknown tool: ${toolCall.name}`)
      );
      await this.sse.error(`Unknown tool: ${toolCall.name}`, this.correlationId);
      return;
    }

    LegalIntakeLogger.logToolCall(
      this.correlationId,
      this.sessionId,
      this.teamId,
      LegalIntakeOperation.TOOL_CALL_START,
      toolCall.name,
      toolCall.arguments
    );

    try {
      const toolResult = await handler(
        toolCall.arguments,
        this.env,
        this.team,
        this.correlationId,
        this.sessionId,
        this.teamId
      );

      ToolUsageMonitor.recordToolUsage(toolCall.name, toolResult.success);
      LegalIntakeLogger.logToolCall(
        this.correlationId,
        this.sessionId,
        this.teamId,
        LegalIntakeOperation.TOOL_CALL_SUCCESS,
        toolCall.name,
        toolCall.arguments,
        toolResult
      );

      await this.sse.emit({
        type: 'tool_result',
        name: toolCall.name,
        result: toolResult
      });

      // Special handling for contact form
      if (toolCall.name === 'show_contact_form' && toolResult.success) {
        await this.handleContactForm(toolResult);
        return;
      }

      const finalResponse = this.extractToolResponse(toolResult);
      
      if (!toolResult.success && toolCall.name === 'create_matter') {
        await this.sse.emit({
          type: 'tool_error',
          response: finalResponse,
          toolName: toolCall.name,
          allowRetry: true
        });
        return;
      }

      await this.sse.final(finalResponse);
    } catch (error) {
      Logger.error('Tool execution failed:', error);
      ToolUsageMonitor.recordToolUsage(toolCall.name, false);
      LegalIntakeLogger.logToolCall(
        this.correlationId,
        this.sessionId,
        this.teamId,
        LegalIntakeOperation.TOOL_CALL_FAILED,
        toolCall.name,
        toolCall.arguments,
        undefined,
        error instanceof Error ? error : new Error(String(error))
      );
      await this.sse.error('Tool execution failed. Please try again.', this.correlationId);
    }
  }

  private hasPlaceholders(params: Record<string, unknown>): boolean {
    const { name, email, phone, location } = params;
    
    const values = [name, email, phone, location]
      .filter((v): v is string => typeof v === 'string');
    
    return values.some(v => hasPlaceholderValue(v));
  }

  private async handleContactForm(toolResult: ToolResult): Promise<void> {
    const contactFormResponse = (toolResult.data && typeof toolResult.data === 'object')
      ? toolResult.data as ContactFormResponse
      : null;

    const requiresLocation = this.team?.config?.jurisdiction?.type === 'state';
    
    const requiredFields = ['name', 'email', 'phone'];
    if (requiresLocation) {
      requiredFields.push('location');
    }

    await this.sse.emit({
      type: 'contact_form',
      data: {
        fields: ['name', 'email', 'phone', 'location', 'opposingParty'],
        required: requiredFields,
        message: (toolResult.data as Record<string, unknown>)?.message || 
                'Please fill out the contact form below.',
        initialValues: contactFormResponse?.contactForm?.initialValues
      }
    });
  }

  private extractToolResponse(toolResult: ToolResult): string {
    if (toolResult.success) {
      if (toolResult.message) return toolResult.message;
      
      const data = toolResult.data;
      if (data && typeof data === 'object') {
        if ('message' in data && typeof (data as Record<string, unknown>).message === 'string') {
          return (data as Record<string, unknown>).message as string;
        }
        if ('response' in data && typeof (data as Record<string, unknown>).response === 'string') {
          return (data as Record<string, unknown>).response as string;
        }
      }
      
      return 'Tool executed successfully.';
    } else {
      if (toolResult.error?.toUserResponse) {
        return toolResult.error.toUserResponse();
      }
      if (toolResult.error?.message) {
        return toolResult.error.message;
      }
      return 'An error occurred while executing the tool.';
    }
  }

}

// ============================================================================
// TOOL HANDLERS
// ============================================================================

async function handleCreateMatter(
  parameters: Record<string, unknown>,
  env: Env,
  team: Team | null,
  correlationId?: string,
  sessionId?: string,
  teamId?: string
): Promise<ToolResult> {
  Logger.debug('[handleCreateMatter] parameters:', 
    ToolCallParser.sanitizeParameters(parameters));

  const { matter_type, description, urgency, name, phone, email, location, opposing_party } = parameters as {
    matter_type?: string;
    description?: string;
    urgency?: string;
    name?: string;
    phone?: string;
    email?: string;
    location?: string;
    opposing_party?: string;
  };
  
  // Validate for placeholders
  if (ValidationService.hasPlaceholderValues(phone as string, email as string) ||
      hasPlaceholderValue(name as string) || hasPlaceholderValue(location as string)) {
    return createValidationError(
      "I need your actual information to proceed. Could you please provide your real name, contact details, and location?"
    );
  }
  
  // Validate required fields
  if (!matter_type || !description || !name) {
    return createValidationError(
      "I'm missing some essential information. Could you please provide your name, contact information, and describe your legal issue?"
    );
  }
  
  if (!ValidationService.validateMatterType(matter_type as string)) {
    return createValidationError(
      "I need to understand your legal situation better. Could you please describe what type of legal help you need?"
    );
  }
  
  if (!ValidationService.validateName(name as string)) {
    return createValidationError(
      "I need your full name to proceed. Could you please provide your complete name?"
    );
  }
  
  if (email && !ValidationService.validateEmail(email as string)) {
    return createValidationError(
      "The email address doesn't appear to be valid. Could you please provide a valid email?"
    );
  }
  
  if (phone && (phone as string).trim() !== '') {
    const phoneValidation = ValidationService.validatePhone(phone as string);
    if (!phoneValidation.isValid) {
      return createValidationError(
        `The phone number doesn't appear to be valid: ${phoneValidation.error}. Could you please provide a valid phone number?`
      );
    }
  }
  
  if (location && !ValidationService.validateLocation(location as string)) {
    return createValidationError(
      "Could you please provide your city and state or country?"
    );
  }
  
  if (!phone && !email) {
    return createValidationError(
      "I need at least one way to contact you. Could you provide either your phone number or email address?"
    );
  }

  const finalUrgency = urgency || 'unknown';
  
  // Process payment
  const paymentRequest = {
    customerInfo: {
      name: name as string,
      email: (email as string) || '',
      phone: (phone as string) || '',
      location: (location as string) || ''
    },
    matterInfo: {
      type: matter_type as string,
      description: description as string,
      urgency: finalUrgency,
      opposingParty: (opposing_party as string) || ''
    },
    teamId: team?.id || env.BLAWBY_TEAM_ULID,
    sessionId: sessionId || 'session-' + Date.now()
  };

  if (!paymentRequest.teamId) {
    throw new Error('Team ID not configured - cannot process payment');
  }

  const { invoiceUrl, paymentId } = await PaymentServiceFactory.processPayment(
    env, 
    paymentRequest, 
    team
  );

  const orchestrationResult = await ContactIntakeOrchestrator.finalizeSubmission({
    env,
    teamConfig: team,
    sessionId,
    teamId,
    correlationId,
    matter: {
      matterType: matter_type as string,
      description: description as string,
      name: name as string,
      email: (email as string) || undefined,
      phone: (phone as string) || undefined,
      location: (location as string) || undefined,
      opposingParty: (opposing_party as string) || undefined,
      urgency: finalUrgency
    }
  });

  const requiresPayment = team?.config?.requiresPayment || false;
  const consultationFee = team?.config?.consultationFee || 0;

  const { generateCompleteMatterMessage } = await import('../../utils/messageTemplates');
  const { analyzeMissingInfo } = await import('../../../src/utils/matterAnalysis');

  const matterForAnalysis = {
    service: matter_type as string,
    matterSummary: description as string,
    status: 'ready' as const,
    urgency: finalUrgency,
    jurisdiction: location as string
  };

  const missingInfo = analyzeMissingInfo(matterForAnalysis);

  const matterData = {
    name: name as string,
    email: (email as string) || 'Not provided',
    phone: (phone as string) || 'Not provided',
    location: (location as string) || 'Not provided',
    opposingParty: opposing_party as string,
    matterType: matter_type as string,
    description: description as string,
    urgency: finalUrgency,
    requiresPayment: requiresPayment && consultationFee > 0,
    consultationFee,
    paymentLink: invoiceUrl || team?.config?.paymentLink,
    pdfFilename: orchestrationResult.pdf?.filename,
    missingInfo
  };

  const summaryMessage = generateCompleteMatterMessage(matterData);

  return createSuccessResponse(summaryMessage, {
    matter_type: matter_type as string,
    description: description as string,
    urgency: finalUrgency,
    name: name as string,
    phone: phone as string,
    email: email as string,
    location: location as string,
    opposing_party: opposing_party as string,
    requires_payment: requiresPayment,
    consultation_fee: consultationFee,
    payment_link: invoiceUrl || team?.config?.paymentLink,
    payment_embed: invoiceUrl ? {
      paymentUrl: invoiceUrl,
      amount: consultationFee,
      description: `${matter_type as string}: ${description as string}`,
      paymentId
    } : null,
    case_summary_pdf: orchestrationResult.pdf ?? null,
    notifications: orchestrationResult.notifications ?? null
  });
}

async function handleRequestLawyerReview(
  parameters: Record<string, unknown>,
  env: Env,
  team: Team | null,
  correlationId?: string,
  sessionId?: string,
  teamId?: string
): Promise<ToolResult> {
  const { urgency, complexity, matter_type } = parameters as {
    urgency?: string;
    complexity?: string;
    matter_type?: string;
  };
  
  let contactName: string | undefined;
  let contactEmail: string | undefined;
  let contactPhone: string | undefined;
  let matterDescription: string | undefined;

  if (sessionId && teamId) {
    try {
      const context = await ConversationContextManager.load(sessionId, teamId, env);
      contactName = context.contactInfo?.name?.trim() || undefined;
      contactEmail = context.contactInfo?.email?.trim() || undefined;
      contactPhone = context.contactInfo?.phone?.trim() || undefined;

      if (context.caseDraft?.key_facts?.length) {
        matterDescription = context.caseDraft.key_facts.join('\n');
      } else if (context.pendingContactForm?.reason) {
        matterDescription = context.pendingContactForm.reason;
      }
    } catch (error) {
      Logger.warn('[handleRequestLawyerReview] Failed to load context', {
        correlationId,
        sessionId,
        teamId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const hasValidEmail = Boolean(contactEmail && ValidationService.validateEmail(contactEmail));
  const hasValidPhone = Boolean(contactPhone && ValidationService.validatePhone(contactPhone).isValid);
  const hasReachableContact = hasValidEmail || hasValidPhone;
  const isNameValid = Boolean(contactName && ValidationService.validateName(contactName));
  const hasPlaceholders = ValidationService.hasPlaceholderValues(contactPhone, contactEmail);

  if (!isNameValid || !hasReachableContact || hasPlaceholders) {
    return createValidationError(
      "I still need your real contact information before I can connect you with a lawyer. " +
      "Please share your full name and either a valid email address or phone number."
    );
  }

  if (parameters.matter_type && !ValidationService.validateMatterType(parameters.matter_type as string)) {
    return createValidationError(
      "Please confirm the type of legal matter so I can route your request correctly."
    );
  }

  const { NotificationService } = await import('../../services/NotificationService.js');
  const notificationService = new NotificationService(env);

  await notificationService.sendLawyerReviewNotification({
    type: 'lawyer_review',
    teamConfig: team,
    matterInfo: {
      type: matter_type as string,
      urgency: urgency as string,
      complexity: complexity as string,
      description: matterDescription
    },
    clientInfo: {
      name: contactName,
      email: contactEmail,
      phone: contactPhone
    }
  });

  return createSuccessResponse(
    "I've requested a lawyer review for your case due to its urgent nature. A lawyer will review your case and contact you to discuss further."
  );
}


async function handleCreatePaymentInvoice(
  parameters: Record<string, unknown>,
  env: Env,
  team?: Team | null
): Promise<ToolResult> {
  const sessionId = crypto.randomUUID();

  if (!team?.id) {
    return {
      success: false,
      error: {
        message: 'Team configuration missing: team ID is required for payment processing',
        toUserResponse: () => 'Team configuration error. Please contact support.'
      }
    };
  }

  const { invoice_id, amount, currency, recipient, description, due_date } = parameters as {
    invoice_id?: string;
    amount?: number;
    currency?: string;
    recipient?: { name: string; email: string };
    description?: string;
    due_date?: string;
  };

  try {
    const paymentService = PaymentServiceFactory.createPaymentService(env);

    const paymentRequest = {
      customerInfo: {
        name: recipient?.name || '',
        email: recipient?.email || '',
        phone: '',
        location: ''
      },
      matterInfo: {
        type: 'consultation',
        description: description as string,
        urgency: 'normal',
        opposingParty: ''
      },
      teamId: team.id,
      sessionId,
      invoiceId: invoice_id as string,
      currency: currency as string,
      dueDate: due_date as string
    };

    const result = await paymentService.createInvoice(paymentRequest);

    if (result.success) {
      return {
        success: true,
        data: {
          action: 'show_payment',
          message: `I've created a payment invoice for your consultation. Please complete the payment to proceed.`,
          payment: {
            invoiceUrl: result.invoiceUrl!,
            paymentId: result.paymentId!,
            amount,
            serviceType: 'consultation',
            sessionId
          }
        }
      };
    } else {
      return {
        success: false,
        error: {
          message: result.error || 'Failed to create payment invoice',
          toUserResponse: () => 'Payment service unavailable. Please try again later.'
        }
      };
    }
  } catch (error) {
    Logger.error('❌ Payment invoice creation failed:', error);
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
        toUserResponse: () => 'Payment service unavailable. Please try again later.'
      }
    };
  }
}

async function handleShowContactForm(
  parameters: unknown,
  env: Env,
  team?: Team | null,
  correlationId?: string,
  sessionId?: string,
  teamId?: string
): Promise<ToolResult> {
  try {
    const params = parameters && typeof parameters === 'object' ? parameters as ContactFormParameters : {};
    const reason = params.reason || 'your legal matter';

    let initialValues: ContactFormData['initialValues'];

    if (sessionId && teamId) {
      try {
        const context = await ConversationContextManager.load(sessionId, teamId, env);
        if (context?.contactInfo) {
          const sanitizedValues: Record<string, string> = {};
          const { contactInfo } = context;

          if (contactInfo.name && typeof contactInfo.name === 'string') {
            sanitizedValues.name = contactInfo.name.trim();
          }
          if (contactInfo.email && typeof contactInfo.email === 'string') {
            sanitizedValues.email = contactInfo.email.trim();
          }
          if (contactInfo.phone && typeof contactInfo.phone === 'string') {
            sanitizedValues.phone = contactInfo.phone.trim();
          }
          if (contactInfo.location && typeof contactInfo.location === 'string') {
            sanitizedValues.location = contactInfo.location.trim();
          }

          if (Object.keys(sanitizedValues).length > 0) {
            initialValues = sanitizedValues;
          }
        }
      } catch (contextError) {
        Logger.warn('[handleShowContactForm] Failed to load context', {
          sessionId,
          teamId,
          error: contextError instanceof Error ? contextError.message : String(contextError)
        });
      }
    }

    const response: ContactFormResponse = {
      success: true,
      action: 'show_contact_form',
      message: `I'd be happy to help you with ${reason.toLowerCase()}. Please fill out the contact form below so we can get in touch with you.`,
      contactForm: {
        reason,
        fields: {
          name: { required: true, label: 'Full Name' },
          email: { required: true, label: 'Email Address' },
          phone: { required: false, label: 'Phone Number' },
          location: { required: true, label: 'Location (City, State)' },
          opposing_party: { required: false, label: 'Opposing Party (if applicable)' },
          message: { required: false, label: 'Additional Details' }
        },
        submitText: 'Submit Contact Form',
        initialValues
      }
    };

    return createSuccessResult(response);
  } catch (error) {
    Logger.error('[handleShowContactForm] Unexpected error:', error);
    const validationError = new ValidationError(
      'An unexpected error occurred while processing your request. Please try again.',
      {
        originalError: error instanceof Error ? error.message : String(error),
        method: 'handleShowContactForm',
        correlationId,
        sessionId,
        teamId
      }
    );
    return createErrorResult(validationError);
  }
}

const TOOL_HANDLERS = {
  show_contact_form: handleShowContactForm,
  create_matter: handleCreateMatter,
  request_lawyer_review: handleRequestLawyerReview,
  create_payment_invoice: handleCreatePaymentInvoice
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Determines the analysis type based on file attachment
 */
// determineAnalysisType function moved to fileAnalysisMiddleware.ts

// ============================================================================
// MAIN AGENT ORCHESTRATOR
// ============================================================================

function getAvailableTools(state: ConversationState, context: ConversationContext): ToolDefinition[] {
  const allTools = [createMatter, showContactForm, requestLawyerReview, createPaymentInvoice];
  
  switch (state) {
    case ConversationState.GATHERING_INFORMATION:
      return [];
    case ConversationState.QUALIFYING_LEAD:
      return context.isQualifiedLead ? [showContactForm] : [];
    case ConversationState.SHOWING_CONTACT_FORM:
      return [showContactForm];
    case ConversationState.READY_TO_CREATE_MATTER:
    case ConversationState.CREATING_MATTER:
      return [createMatter, showContactForm];
    case ConversationState.COMPLETED:
      return allTools;
    default:
      return [];
  }
}

function buildPromptMessages(messages: readonly AgentMessage[]): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
  return messages.map(msg => ({
    role: msg.role || (msg.isUser ? 'user' : 'assistant'),
    content: msg.content || ''
  }));
}

function extractAIResponse(aiResult: unknown): string {
  if (aiResult && typeof aiResult === 'object' && 'response' in aiResult) {
    const response = (aiResult as Record<string, unknown>).response;
    return typeof response === 'string' ? response : 
      'I apologize, but I encountered an error processing your request.';
  }
  return 'I apologize, but I encountered an error processing your request.';
}

function hasToolCalls(aiResult: unknown): aiResult is { tool_calls: ToolCall[] } {
  return aiResult !== null && 
         typeof aiResult === 'object' && 
         'tool_calls' in aiResult && 
         Array.isArray((aiResult as Record<string, unknown>).tool_calls) && 
         ((aiResult as Record<string, unknown>).tool_calls as unknown[]).length > 0;
}

export async function runLegalIntakeAgentStream(
  env: Env,
  messages: readonly AgentMessage[],
  teamId?: string,
  sessionId?: string,
  cloudflareLocation?: CloudflareLocation,
  controller?: ReadableStreamDefaultController<Uint8Array>,
  attachments: readonly FileAttachment[] = []
): Promise<AgentResponse | void> {
  Logger.initialize({ DEBUG: env.DEBUG, NODE_ENV: env.NODE_ENV });
  
  const correlationId = LegalIntakeLogger.generateCorrelationId();
  const sse = new SSEController(controller);

  try {
    await sse.emit({ type: 'connected' });

    const team = teamId ? await teamCache.get(teamId, env) : null;

    LegalIntakeLogger.logAgentStart(
      correlationId,
      sessionId,
      teamId,
      messages.length,
      attachments.length > 0,
      attachments.length,
      team ? { hasConfig: true } : { hasConfig: false }
    );

    // Build conversation text
    const conversationText = messages
      .map(msg => `${msg.role || (msg.isUser ? 'user' : 'assistant')}: ${msg.content || ''}`)
      .join('\n');

    // Check for completion state
    const hasCompletionCues = 
      safeIncludes(conversationText.toLowerCase(), 'matter created') ||
      safeIncludes(conversationText.toLowerCase(), 'consultation fee') ||
      safeIncludes(conversationText.toLowerCase(), 'already helped you create a matter');

    const hasToolInvocation = messages.some(msg =>
      msg.metadata?.toolName === 'create_matter' ||
      (msg.content && safeIncludes(msg.content, 'TOOL_CALL: create_matter'))
    );

    if (hasCompletionCues || hasToolInvocation) {
      const completionMessage = 
        "I've already helped you create a matter for your case. A lawyer will contact you within 24 hours to discuss your situation further. Is there anything else I can help you with?";

      if (controller) {
        await sse.final(completionMessage);
      } else {
        const lastUserMessage = messages.filter(msg => msg.isUser).pop()?.content || null;
        return {
          response: completionMessage,
          metadata: {
            conversationComplete: true,
            sessionId,
            teamId,
            inputMessageCount: messages.length,
            lastUserMessage
          }
        };
      }
      return;
    }

    // Detect context
    const context = ContextDetector.detectContext(conversationText);

    // Get available tools and build prompt
    const availableTools = getAvailableTools(context.state, context);
    const systemPrompt = PromptBuilder.build(context, team, teamId);

    Logger.info('Conversation State:', {
      correlationId,
      sessionId,
      teamId,
      state: context.state,
      messageCount: messages.length,
      hasLegalIssue: Boolean(context.legalIssueType),
      hasDescription: Boolean(context.description),
      isQualifiedLead: context.isQualifiedLead,
      availableTools: availableTools.map(tool => tool.name)
    });

    // Single AI call
    const aiCallStartTime = Date.now();
    LegalIntakeLogger.logAIModelCall(
      correlationId,
      sessionId,
      teamId,
      LegalIntakeOperation.AI_MODEL_CALL,
      AI_MODEL_CONFIG.model
    );

    const aiResult = await withAIRetry(
      () => env.AI.run(AI_MODEL_CONFIG.model as any, {
        messages: [
          { role: 'system', content: systemPrompt },
          ...buildPromptMessages(messages)
        ],
        tools: availableTools,
        max_tokens: AI_MODEL_CONFIG.maxTokens,
        temperature: AI_MODEL_CONFIG.temperature,
        stream: true
      }),
      { attempts: 4, baseDelay: 400, operationName: 'Legal Intake AI Call' }
    );

    const executor = new ToolExecutor(env, team, sse, correlationId, sessionId, teamId);

    let finalResponse = '';
    let streamToolCalls: ToolCall[] = [];
    let handled = false;

    const possibleStream = isReadableStream(aiResult)
      ? aiResult
      : typeof (aiResult as Response)?.body?.getReader === 'function'
        ? (aiResult as Response).body!
        : undefined;

    if (possibleStream) {
      const streamResult = await consumeAIStream(possibleStream, sse);
      finalResponse = streamResult.text;
      streamToolCalls = streamResult.toolCalls;
      handled = true;
    }

    if (!handled) {
      const response = extractAIResponse(aiResult);
      finalResponse = response;

      const responseChunks = chunkResponseText(response);
      if (responseChunks.length === 0) {
        await sse.text(response);
      } else {
        for (const chunk of responseChunks) {
          await sse.text(chunk);
          await sleep(STREAM_TOKEN_DELAY_MS);
        }
      }
    }

    const processingTime = Date.now() - aiCallStartTime;

    LegalIntakeLogger.logAIModelCall(
      correlationId,
      sessionId,
      teamId,
      LegalIntakeOperation.AI_MODEL_RESPONSE,
      AI_MODEL_CONFIG.model,
      undefined,
      finalResponse.length,
      processingTime
    );

    const effectiveToolCalls = streamToolCalls.length > 0 ? streamToolCalls : (hasToolCalls(aiResult) ? aiResult.tool_calls : []);

    if (effectiveToolCalls && effectiveToolCalls.length > 0) {
      await executor.execute(effectiveToolCalls[0]);
    } else {
      const detectedToolCall = ToolCallDetector.detect(finalResponse);
      if (detectedToolCall) {
        await executor.execute(detectedToolCall);
      } else {
        await sse.final(finalResponse);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.error('Agent error occurred', {
      correlationId,
      sessionId,
      teamId,
      error: errorMessage
    });

    LegalIntakeLogger.logAgentError(
      correlationId,
      sessionId,
      teamId,
      error instanceof Error ? error : new Error(String(error))
    );

    await sse.error(errorMessage, correlationId);

    if (!controller) {
      const lastUserMessage = messages.filter(msg => msg.isUser).pop()?.content || null;
      return {
        response: "I encountered an error processing your request. Please try again or contact support if the issue persists.",
        metadata: {
          error: errorMessage,
          sessionId,
          teamId,
          inputMessageCount: messages.length,
          lastUserMessage
        }
      };
    }
  } finally {
    await sse.complete();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  createMatter,
  showContactForm,
  requestLawyerReview,
  createPaymentInvoice,
  TOOL_HANDLERS
};
