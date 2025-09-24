import type { ConversationContext } from './conversationContextManager.js';
import type { TeamConfig } from '../services/TeamService.js';
import type { PipelineMiddleware } from './pipeline.js';
import { JurisdictionValidator as JurisdictionValidatorUtil, type JurisdictionConfig } from '../schemas/jurisdictionConfig.js';

/**
 * Jurisdiction Validator - handles geographic scope validation
 * This provides warnings for out-of-jurisdiction users but doesn't block them
 */
export const jurisdictionValidator: PipelineMiddleware = {
  name: 'jurisdictionValidator',
  
  execute: async (message: string, context: ConversationContext, teamConfig: TeamConfig) => {
    const jurisdiction = teamConfig?.jurisdiction as JurisdictionConfig | undefined;
    
    // If no jurisdiction restrictions, allow all
    if (!jurisdiction) {
      return { context };
    }

    // Validate jurisdiction configuration
    const validation = JurisdictionValidatorUtil.validateConfig(jurisdiction);
    if (!validation.isValid) {
      console.warn('Invalid jurisdiction configuration:', validation.errors);
      return { context }; // Bypass if config is invalid
    }

    // Check if user is in supported jurisdiction
    const userLocation = context.jurisdiction || extractLocationFromMessage(message);
    
    if (userLocation) {
      const isSupported = JurisdictionValidatorUtil.isLocationSupported(userLocation, jurisdiction);
      
      if (!isSupported) {
        // User is outside jurisdiction - provide warning but don't block
        const warning = JurisdictionValidatorUtil.getJurisdictionWarning(
          userLocation, 
          jurisdiction, 
          'our legal team'
        );
        
        // Update context with jurisdiction warning
        const updatedContext = {
          ...context,
          jurisdiction: userLocation,
          safetyFlags: [...(context.safetyFlags || []), 'out_of_jurisdiction']
        };

        // Return warning response but continue pipeline
        return {
          context: updatedContext,
          response: warning
        };
      }
    } else if (jurisdiction.requireLocation) {
      // Location required but not provided - ask for location
      const locationRequest = `To help you best, could you please tell me your city and state? This helps us provide location-specific legal guidance.`;
      
      return {
        context,
        response: locationRequest
      };
    }

    // No jurisdiction issues - continue pipeline
    return { context };
  }
};

/**
 * Extract location from message content
 */
function extractLocationFromMessage(message: string): string | null {
  // Simple state extraction
  const stateMatch = message.match(/\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b/i);
  
  if (stateMatch) {
    return stateMatch[1];
  }

  return null;
}
