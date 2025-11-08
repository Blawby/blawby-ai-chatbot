import type { ConversationContext } from './conversationContextManager.js';
import type { OrganizationConfig } from '../services/OrganizationService.js';
import type { PipelineMiddleware } from './pipeline.js';
import type { Env, AgentMessage } from '../types.js';

// Pre-compiled regex patterns for better performance and accuracy
const LEGAL_MATTER_PATTERNS = {
  'Family Law': /\b(divorce|custody|child support|family dispute|paternity|alimony|spousal support|domestic violence|restraining order)\b/i,
  'Employment Law': /\b(employment|workplace|wrongful termination|discrimination|harassment|unpaid wage|overtime dispute|wrongfully fired|employment contract|workplace injury)\b/i,
  'Business Law': /\b(business formation|corporate law|LLC formation|partnership agreement|business contract|corporate governance|merger|acquisition)\b/i,
  'Intellectual Property': /\b(patent|trademark|copyright|intellectual property|IP infringement|trade secret|brand protection)\b/i,
  'Personal Injury': /\b(personal injury|car accident|slip and fall|medical malpractice|product liability|wrongful death|premises liability)\b/i,
  'Criminal Law': /\b(criminal defense|arrest|criminal charges|DUI|theft|assault|fraud|white collar crime|criminal trial)\b/i,
  'Civil Law': /\b(civil lawsuit|civil dispute|breach of contract|property dispute|tort claim|civil litigation)\b/i,
  'Tenant Rights Law': /\b(tenant rights|landlord dispute|eviction|rental agreement|housing discrimination|security deposit|habitability)\b/i,
  'Probate and Estate Planning': /\b(estate planning|probate|will|trust|inheritance|power of attorney|estate administration)\b/i,
  'Special Education and IEP Advocacy': /\b(special education|IEP|504 plan|disability accommodation|educational rights|school discrimination)\b/i,
  'Small Business and Nonprofits': /\b(small business|nonprofit|non-profit|entrepreneur|startup legal|business compliance)\b/i,
  'Contract Review': /\b(contract review|agreement review|legal document review|contract negotiation|terms and conditions)\b/i,
  'Immigration Law': /\b(immigration|visa|green card|citizenship|deportation|asylum|refugee|naturalization|work permit|immigration status)\b/i,
  'General Consultation': /\b(legal consultation|need legal advice|seeking attorney|legal guidance|legal help|lawyer consultation)\b/i
} as const;

const GENERAL_LEGAL_PATTERNS = [
  /\b(need a lawyer|want a lawyer|talk to a lawyer|speak with attorney|hire an attorney|find a lawyer)\b/i,
  /\b(legal consultation|legal guidance|legal help|legal advice|lawyer consultation)\b/i,
  /\b(legal problem|legal issue|legal situation|legal matter|legal question)\b/i
] as const;

/**
 * Business Scope Validator - handles service availability and scope validation
 * This is where we check if the organization offers the services the user needs
 */
export const businessScopeValidator: PipelineMiddleware = {
  kind: 'standard',
  name: 'businessScopeValidator',
  
  execute: async (messages: AgentMessage[], context: ConversationContext, organizationConfig: OrganizationConfig, _env: Env) => {
    // Guard clause: ensure we have at least one message
    if (!messages || messages.length === 0) {
      console.warn('businessScopeValidator: No messages provided');
      return { context };
    }
    
    const latestMessage = messages[messages.length - 1];
    const availableServices = organizationConfig?.availableServices || [];
    
    // If organization offers General Consultation, allow most requests
    if (availableServices.includes('General Consultation')) {
      return { context };
    }

    // Check if we have established legal context that matches available services
    if (context.establishedMatters.length > 0) {
      const hasRelevantService = context.establishedMatters.some(matter => 
        availableServices.includes(matter)
      );

      if (hasRelevantService) {
        // User is asking about a service the organization offers - allow
        return { context };
      }
    }

    // Check current message for legal matter types
    const currentMessageMatters = extractLegalMatterTypes(latestMessage.content);
    
    if (currentMessageMatters.length > 0) {
      const hasRelevantService = currentMessageMatters.some(matter => 
        availableServices.includes(matter)
      );

      if (hasRelevantService) {
        // Current message is about a service the organization offers - allow
        return { context };
      }

      // Current message is about a service the organization doesn't offer
      const unavailableMatters = currentMessageMatters.filter(matter => 
        !availableServices.includes(matter)
      );

      if (unavailableMatters.length > 0) {
        const response = getScopeViolationResponse(unavailableMatters, availableServices, organizationConfig);
        
        return {
          context,
          response,
          shouldStop: true
        };
      }
    }

    // Allow contact-collection flows to proceed without blocking on service availability
    if (context.userIntent === 'lawyer_contact' || context.conversationPhase === 'contact_collection') {
      return { context };
    }

    // Check for general legal requests when no specific matter is established
    if (isGeneralLegalRequest(latestMessage.content) && context.establishedMatters.length === 0) {
      const response = getGeneralLegalResponse(availableServices, organizationConfig);
      
      return {
        context,
        response,
        shouldStop: true
      };
    }

    // No scope violations - continue pipeline
    return { context };
  }
};

/**
 * Extract legal matter types from message content
 */
function extractLegalMatterTypes(content: string): string[] {
  const foundMatters: string[] = [];
  
  for (const [matterType, pattern] of Object.entries(LEGAL_MATTER_PATTERNS)) {
    if (pattern.test(content)) {
      foundMatters.push(matterType);
    }
  }

  return foundMatters;
}

/**
 * Check if message is a general legal request
 */
function isGeneralLegalRequest(message: string): boolean {
  return GENERAL_LEGAL_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Get response for scope violations
 */
function getScopeViolationResponse(
  unavailableMatters: string[], 
  availableServices: string[], 
  organizationConfig: OrganizationConfig
): string {
  const organizationName = organizationConfig?.description || 'your organization';
  const matterList = unavailableMatters.join(', ');
  const availableList = availableServices.join(', ');

  return `I understand you're dealing with a ${matterList} matter. While ${organizationName} specializes in ${availableList}, I'd be happy to help you find a lawyer who specializes in ${matterList}. 

Would you like me to:
1. Help you with a different legal matter that we do handle?
2. Provide you with resources to find a ${matterList} attorney?
3. Answer general questions about ${matterList}?`;
}

/**
 * Get response for general legal requests when organization doesn't offer General Consultation
 */
function getGeneralLegalResponse(availableServices: string[], organizationConfig: OrganizationConfig): string {
  const organizationName = organizationConfig?.description || 'your organization';
  const availableList = availableServices.join(', ');

  return `I'd be happy to help you with your legal needs! ${organizationName} specializes in ${availableList}.

To better assist you, could you tell me:
1. What type of legal issue are you dealing with?
2. What specific help do you need?

This will help me determine if we can assist you directly or connect you with the right resources.`;
}

/**
 * Get referral response for out-of-scope matters
 */
function _getReferralResponse(matterType: string, organizationConfig: OrganizationConfig): string {
  const organizationName = organizationConfig?.description || 'your organization';
  
  return `While ${organizationName} doesn't handle ${matterType} matters, I can help you find a qualified attorney who specializes in this area. 

Here are some resources:
- State Bar Association referral services
- Legal aid organizations
- Specialized attorney directories

Would you like me to provide more specific guidance on finding a ${matterType} attorney?`;
}
