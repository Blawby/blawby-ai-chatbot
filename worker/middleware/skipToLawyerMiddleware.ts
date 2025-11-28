import type { ConversationContext } from './conversationContextManager.js';
import type { OrganizationConfig } from '../types.js';
import type { PipelineMiddleware } from './pipeline.js';
import { LawyerSearchService } from '../services/LawyerSearchService.js';
import { RemoteApiService } from '../services/RemoteApiService.js';
import type { LawyerSearchResponse } from '../schemas/lawyer';
import { QuotaExceededError, LawyerSearchError, LawyerSearchTimeoutError } from '../utils/lawyerSearchErrors.js';
import { Logger } from '../utils/logger.js';
import type { Env, AgentMessage } from '../types.js';

// Matter information extracted from user message
interface MatterInfo {
  matterType: string;
  urgency: string;
  reason: string;
}

// Middleware response type
interface MiddlewareResponse {
  context: ConversationContext;
  response: string;
  shouldStop: boolean;
  metadata?: {
    action: string;
    lawyers?: LawyerSearchResponse['lawyers'];
    total?: number;
    matterType?: string;
    alternatives?: string[];
  };
}

/**
 * Skip to Lawyer Middleware - handles requests to skip intake and go directly to lawyers
 * Routes to contact form (organization mode) or lawyer search (public mode)
 * Now conversation-aware: only triggers on explicit skip requests, not casual mentions
 */
export const skipToLawyerMiddleware: PipelineMiddleware = {
  kind: 'standard',
  name: 'skipToLawyerMiddleware',
  
  execute: async (messages: AgentMessage[], context: ConversationContext, _organizationConfig: OrganizationConfig, env: Env) => {
    // Guard against empty messages array
    if (!messages || messages.length === 0) {
      return { context };
    }

    // Build conversation text for context-aware analysis
    const conversationText = messages.map(msg => msg.content).join(' ');
    const latestMessage = messages[messages.length - 1];
    
    // Guard against missing or invalid message content
    if (!latestMessage || !latestMessage.content || typeof latestMessage.content !== 'string') {
      return { context };
    }
    
    // Check if user wants to skip intake and go directly to a lawyer
    // Only trigger on explicit requests, not casual mentions in conversation
    const skipKeywords = [
      'skip the intake',
      'skip intake',
      'go directly to a lawyer',
      'find a lawyer',
      'need a lawyer',
      'want a lawyer',
      'connect with a lawyer',
      'speak to a lawyer',
      'talk to a lawyer',
      'get a lawyer',
      'hire a lawyer',
      'lawyer now',
      'urgent lawyer',
      'immediate lawyer',
      'contact your organization',
      'want to contact your organization',
      'contact the organization',
      'want to contact the organization',
      'connect with your organization',
      'speak to your organization',
      'talk to your organization'
    ];

    // Only check the latest message for skip requests to avoid false positives
    // from earlier conversation context
    const latestMessageText = latestMessage.content.toLowerCase();
    const isSkipRequest = skipKeywords.some(keyword => 
      latestMessageText.includes(keyword.toLowerCase())
    );

    const forceSkipKeywords = [
      'need a lawyer',
      'need a lawyer asap',
      'lawyer asap',
      'lawyer now',
      'urgent lawyer',
      'immediate lawyer',
      'need an attorney',
      'need an attorney asap',
      'attorney asap',
      'attorney now'
    ];
    const isUrgentDirectRequest = forceSkipKeywords.some(keyword => latestMessageText.includes(keyword));

    // Additional context check: if we're in the middle of a conversation about a legal issue,
    // be more conservative about triggering skip
    const hasEstablishedLegalContext = context.establishedMatters.length > 0 || 
                                     context.conversationPhase !== 'initial';
    
    const shouldTriggerSkipFlow = isSkipRequest && (!hasEstablishedLegalContext || messages.length <= 3 || isUrgentDirectRequest);

    if (!shouldTriggerSkipFlow) {
      return { context };
    }

    // Determine if this is public mode or organization mode based on organizationId
    const isPublicMode = await determineMode(context.organizationId, env);
    
    Logger.debug('[skipToLawyerMiddleware] Organization config:', {
      organizationId: context.organizationId,
      isPublicMode,
      messageCount: messages.length,
      hasEstablishedLegalContext
    });
    
    // Extract matter type and urgency from conversation context
    const matterInfo = extractMatterInfo(conversationText);

    if (isPublicMode) {
      // Public mode: Trigger lawyer search
      return await handlePublicMode(matterInfo, context, env);
    } else {
      // Organization mode: Show contact form
      return handleOrganizationMode(matterInfo, context);
    }
  }
};

/**
 * Retry utility with exponential backoff
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 100
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) {
        throw lastError;
      }
      
      // Exponential backoff: 100ms, 200ms, 400ms, etc.
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

/**
 * Determine if this is public mode or organization mode
 */
async function determineMode(organizationId: string | null | undefined, env: Env): Promise<boolean> {
  // Public mode: no organization ID
  if (!organizationId) {
    return true;
  }

  try {
    // Fetch the organization by ID to check its slug with retry logic
    const organization = await retryWithBackoff(
      () => RemoteApiService.getOrganization(env, organizationId),
      3, // max attempts
      100 // base delay in ms
    );
    
    // Explicit handling: if organization lookup completed successfully but returned no org
    if (!organization) {
      Logger.warn('[skipToLawyerMiddleware] Organization lookup completed but returned null/undefined', {
        organizationId,
        context: 'determineMode'
      });
      return true; // Public mode for missing organizations
    }
    
    // Check if this is a public organization (like blawby-ai)
    if (organization.slug === 'blawby-ai') {
      return true;
    }
    
    // Organization mode: specific law firm organizations
    return false;
    
  } catch (error) {
    Logger.error('[skipToLawyerMiddleware] Failed to fetch organization for mode determination after retries', {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
      context: 'determineMode'
    });
    
    // Return false (organization mode) on fetch errors - do NOT default to public mode
    return false;
  }
}

/**
 * Extract matter type and urgency from message
 */
function extractMatterInfo(message: string): MatterInfo {
  const matterTypes = [
    'family law', 'employment law', 'business law', 'contract review',
    'intellectual property', 'personal injury', 'criminal law', 'civil law',
    'real estate', 'estate planning', 'immigration', 'bankruptcy'
  ];

  const matterType = matterTypes.find(type => 
    message.toLowerCase().includes(type.toLowerCase())
  ) || 'General Consultation';

  let urgency = 'medium';
  if (message.toLowerCase().includes('urgent') || message.toLowerCase().includes('emergency') || 
      message.toLowerCase().includes('immediate') || message.toLowerCase().includes('asap')) {
    urgency = 'high';
  } else if (message.toLowerCase().includes('not urgent') || message.toLowerCase().includes('routine')) {
    urgency = 'low';
  }

  const reason = message.length > 100 ? message.substring(0, 100) + '...' : message;

  return { matterType, urgency, reason };
}

/**
 * Handle public mode - trigger lawyer search
 */
async function handlePublicMode(matterInfo: MatterInfo, context: ConversationContext, env: Env): Promise<MiddlewareResponse> {
  try {
    Logger.debug('[skipToLawyerMiddleware] Attempting lawyer search for:', matterInfo);
    
    // Check if we have the API key
    if (!env.LAWYER_SEARCH_API_KEY) {
      Logger.warn('[skipToLawyerMiddleware] No lawyer search API key available');
      return handleQuotaExceededFallback(matterInfo, context, 'Our lawyer search service is temporarily unavailable.');
    }

    // Attempt to search for lawyers
    const searchResult = await LawyerSearchService.searchLawyersByMatterType(
      matterInfo.matterType,
      env.LAWYER_SEARCH_API_KEY,
      undefined // location - could be extracted from context if available
    );

    Logger.info('[skipToLawyerMiddleware] Lawyer search successful:', {
      lawyersFound: searchResult.lawyers.length,
      total: searchResult.total
    });

    const lawyerSummaries = searchResult.lawyers.slice(0, 3).map((lawyer, index) => {
      const parts = [
        `${index + 1}. ${lawyer.name}${lawyer.firm ? ` (${lawyer.firm})` : ''}`,
        lawyer.location ? `   • ${lawyer.location}` : null,
        lawyer.phone ? `   • ${lawyer.phone}` : null,
        lawyer.email ? `   • ${lawyer.email}` : null
      ].filter(Boolean);
      return parts.join('\n');
    }).join('\n');

    const response = `I found ${searchResult.total} ${matterInfo.matterType} lawyers who match what you're looking for.${lawyerSummaries ? `\n\nTop matches:\n${lawyerSummaries}` : ''}\n\nReach out to any of them directly, or tell me if you want help organizing your case summary and documents before you call.`;

    // Update context with lawyer search results
    const updatedContext = {
      ...context,
      lawyerSearchResults: {
        matterType: matterInfo.matterType,
        lawyers: searchResult.lawyers,
        total: searchResult.total
      },
      lastUpdated: Date.now()
    };

    return {
      context: updatedContext,
      response,
      shouldStop: true,
      metadata: {
        action: 'lawyer_search_success',
        lawyers: searchResult.lawyers,
        total: searchResult.total
      }
    };

  } catch (error) {
    Logger.error('[skipToLawyerMiddleware] Lawyer search failed:', error);
    
    // Handle quota exceeded with friendly case preparation pivot
    if (error instanceof QuotaExceededError) {
      return handleQuotaExceededFallback(matterInfo, context, error.message);
    }
    
    // Handle other lawyer search errors
    if (error instanceof LawyerSearchError || error instanceof LawyerSearchTimeoutError) {
      return handleQuotaExceededFallback(matterInfo, context, error.message);
    }
    
    // Handle any other errors
    return handleQuotaExceededFallback(matterInfo, context, 'We\'re having trouble connecting to our lawyer search service right now.');
  }
}

/**
 * Handle quota exceeded or other errors by pivoting to case preparation
 */

function handleQuotaExceededFallback(matterInfo: MatterInfo, context: ConversationContext, errorMessage: string): MiddlewareResponse {
  const response = `${errorMessage}\n\nLet's get you ready for the next lawyer you contact: share the key facts and I'll build a clean case summary, checklist, and PDF you can hand to anyone.`;

  return {
    context,
    response,
    shouldStop: true,
    metadata: {
      action: 'quota_exceeded_fallback',
      matterType: matterInfo.matterType,
      alternatives: ['bar_association', 'online_directories', 'case_preparation']
    }
  };
}

/**
 * Handle organization mode - show contact form
 */
function handleOrganizationMode(matterInfo: MatterInfo, context: ConversationContext): MiddlewareResponse {
  // Check if location is required but not provided
  const _needsLocation = context.safetyFlags?.includes('location_required');
  
  // Instead of returning a text response, set a flag in context to trigger contact form
  const updatedContext = {
    ...context,
    userIntent: 'lawyer_contact' as const,
    conversationPhase: 'contact_collection' as const,
    // Store the matter info for the AI agent to use
    establishedMatters: [matterInfo.matterType],
    pendingContactForm: {
      matterType: matterInfo.matterType,
      urgency: matterInfo.urgency,
      reason: matterInfo.reason
    },
    lastUpdated: Date.now()
  };

  // Return context without stopping - let AI agent handle the contact form
  return {
    context: updatedContext,
    response: '', // Empty response since AI agent will handle the contact form
    shouldStop: false
  };
}
