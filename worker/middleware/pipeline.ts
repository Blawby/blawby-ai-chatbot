import type { ConversationContext } from './conversationContextManager.js';
import type { OrganizationConfig } from '../services/OrganizationService.js';
import type { Env, AgentMessage } from '../types.js';

export interface StandardMiddleware {
  kind: 'standard';
  name: string;
  execute: (
    messages: AgentMessage[],
    context: ConversationContext,
    organizationConfig: OrganizationConfig,
    env: Env
  ) => Promise<{ 
    context: ConversationContext; 
    response?: string;
    shouldStop?: boolean;
  }>;
}

export interface SimpleMiddleware {
  kind: 'simple';
  name: string;
  execute: (
    messages: AgentMessage[],
    context: ConversationContext,
    env: Env
  ) => Promise<{ 
    context: ConversationContext; 
    response?: string;
    shouldStop?: boolean;
  }>;
}

// Discriminated union for all possible middleware types
export type AnyMiddleware = StandardMiddleware | SimpleMiddleware;

// Type predicates for type narrowing
export function isStandardMiddleware(middleware: AnyMiddleware): middleware is StandardMiddleware {
  return middleware.kind === 'standard';
}

export function isSimpleMiddleware(middleware: AnyMiddleware): middleware is SimpleMiddleware {
  return middleware.kind === 'simple';
}

// Legacy type alias for backward compatibility
export type PipelineMiddleware = StandardMiddleware;

export interface PipelineResult {
  context: ConversationContext;
  response: string;
  middlewareUsed: string[];
}

/**
 * Runs a conversation through a pipeline of middleware functions
 * Each middleware can update context and optionally provide a response
 * If a middleware provides a response, the pipeline stops (graceful degradation)
 */
export async function runPipeline(
  messages: AgentMessage[],
  context: ConversationContext,
  organizationConfig: OrganizationConfig,
  middlewares: AnyMiddleware[],
  env: Env
): Promise<PipelineResult> {
  let updatedContext = context;
  let finalResponse = "";
  const middlewareUsed: string[] = [];

  for (const middleware of middlewares) {
    try {
      let result;
      
      // Type-safe narrowing using discriminated union
      if (isSimpleMiddleware(middleware)) {
        result = await middleware.execute(messages, updatedContext, env);
      } else if (isStandardMiddleware(middleware)) {
        result = await middleware.execute(messages, updatedContext, organizationConfig, env);
      } else {
        // This should never happen with proper typing, but provides a fallback
        throw new Error(`Unknown middleware type: ${JSON.stringify(middleware)}`);
      }
      
      // Update context from this middleware
      updatedContext = result.context;
      middlewareUsed.push(middleware.name);
      
      // If middleware provides a response, use it and stop pipeline
      if (result.response) {
        finalResponse = result.response;
        break;
      }
      
      // If middleware says to stop, break the pipeline
      if (result.shouldStop) {
        break;
      }
      
    } catch (error) {
      console.error(`Pipeline middleware ${middleware.name} failed:`, error);
      // Continue to next middleware on error
      continue;
    }
  }

  // If no middleware provided a response, we'll let the AI handle it
  if (!finalResponse) {
    finalResponse = "AI_HANDLE"; // Signal to route handler to use AI
  }

  return {
    context: updatedContext,
    response: finalResponse,
    middlewareUsed
  };
}

/**
 * Creates a middleware that logs pipeline execution
 */
export function createLoggingMiddleware(): StandardMiddleware {
  return {
    kind: 'standard',
    name: 'logging',
    execute: async (messages, context, organizationConfig, _env) => {
      // Null-safe access with defaults
      const latestMessage = messages[messages.length - 1];
      const safeMessage = latestMessage ? String(latestMessage.content || '').substring(0, 100) : '';
      const _safeContext = context || {};
      const _safeOrganizationConfig = organizationConfig || {};
      
      console.log('Pipeline execution:', {
        messageCount: messages.length,
        latestMessage: safeMessage,
        context: {
          establishedMatters: context.establishedMatters || [],
          userIntent: context.userIntent || 'unclear',
          sessionId: context.sessionId || 'unknown'
        },
        organizationConfig: {
          availableServices: organizationConfig.availableServices || []
        }
      });
      
      return { context };
    }
  };
}
