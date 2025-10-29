import { Logger } from '../../utils/logger.js';
import type { ConversationContext } from './index.js';
import { ConversationState } from './index.js';

// Re-export the canonical types for backward compatibility
export type { ConversationContext };
export { ConversationState };

/**
 * Legal intake operation types for structured logging
 */
export enum LegalIntakeOperation {
  AGENT_START = 'agent_start',
  AGENT_COMPLETE = 'agent_complete',
  AGENT_ERROR = 'agent_error',
  STATE_TRANSITION = 'state_transition',
  MATTER_CREATION_START = 'matter_creation_start',
  MATTER_CREATION_SUCCESS = 'matter_creation_success',
  MATTER_CREATION_FAILED = 'matter_creation_failed',
  TOOL_CALL_START = 'tool_call_start',
  TOOL_CALL_SUCCESS = 'tool_call_success',
  TOOL_CALL_FAILED = 'tool_call_failed',
  CONTEXT_EXTRACTION = 'context_extraction',
  VALIDATION_START = 'validation_start',
  VALIDATION_SUCCESS = 'validation_success',
  VALIDATION_FAILED = 'validation_failed',
  AI_MODEL_CALL = 'ai_model_call',
  AI_MODEL_RESPONSE = 'ai_model_response',
  CONVERSATION_ANALYSIS = 'conversation_analysis',
  PII_DETECTION = 'pii_detection',
  SECURITY_EVENT = 'security_event'
}

/**
 * Legal intake log levels
 */
export enum LegalIntakeLogLevel {
  AUDIT = 'audit',      // Critical operations that must be audited
  INFO = 'info',        // General information
  DEBUG = 'debug',      // Debug information
  WARN = 'warn',        // Warning conditions
  ERROR = 'error'       // Error conditions
}

/**
 * Base interface for all legal intake log entries
 */
export interface LegalIntakeLogEntry {
  correlationId: string;
  operation: LegalIntakeOperation;
  level: LegalIntakeLogLevel;
  timestamp: string;
  sessionId?: string;
  organizationId?: string;
  userId?: string;
  message: string;
  metadata?: Record<string, unknown>;
  duration?: number; // in milliseconds
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
}

/**
 * Specific log entry interfaces for different operations
 */
export interface AgentStartLogEntry extends LegalIntakeLogEntry {
  operation: LegalIntakeOperation.AGENT_START;
  metadata: {
    messageCount: number;
    hasAttachments: boolean;
    attachmentCount?: number;
    organizationConfig?: {
      hasConfig: boolean;
      organizationSlug?: string;
    };
  };
}

export interface StateTransitionLogEntry extends LegalIntakeLogEntry {
  operation: LegalIntakeOperation.STATE_TRANSITION;
  metadata: {
    fromState: ConversationState;
    toState: ConversationState;
    trigger: string;
    contextSnapshot: Partial<ConversationContext>;
  };
}

/**
 * Context information for matter creation operations, tracking both presence flags and optional values
 * @property hasName - Presence flag indicating whether name information is available
 * @property hasEmail - Presence flag indicating whether email information is available
 * @property hasPhone - Presence flag indicating whether phone information is available
 * @property hasLocation - Presence flag indicating whether location information is available
 * @property hasDescription - Presence flag indicating whether description information is available
 * @property name - Optional string containing the actual name value
 * @property email - Optional string containing the actual email value
 * @property phone - Optional string containing the actual phone value
 * @property location - Optional string containing the actual location value
 * @property description - Optional string containing the actual description value
 */
export interface MatterCreationContext {
  hasName: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  hasLocation: boolean;
  hasDescription: boolean;
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  description?: string;
}

export interface MatterCreationLogEntry extends LegalIntakeLogEntry {
  operation: LegalIntakeOperation.MATTER_CREATION_START | LegalIntakeOperation.MATTER_CREATION_SUCCESS | LegalIntakeOperation.MATTER_CREATION_FAILED;
  metadata: {
    matterType: string;
    hasName: boolean;
    hasEmail: boolean;
    hasPhone: boolean;
    hasLocation: boolean;
    hasDescription: boolean;
    sanitizedData?: {
      name?: string;
      email?: string;
      phone?: string;
      location?: string;
    };
  };
}

export interface ToolCallLogEntry extends LegalIntakeLogEntry {
  operation: LegalIntakeOperation.TOOL_CALL_START | LegalIntakeOperation.TOOL_CALL_SUCCESS | LegalIntakeOperation.TOOL_CALL_FAILED;
  metadata: {
    toolName: string;
    parameters?: Record<string, unknown>;
    result?: unknown;
  };
}

export interface AIModelLogEntry extends LegalIntakeLogEntry {
  operation: LegalIntakeOperation.AI_MODEL_CALL | LegalIntakeOperation.AI_MODEL_RESPONSE;
  metadata: {
    model?: string;
    provider?: string;
    tokenCount?: number;
    responseLength?: number;
    processingTime?: number;
    fallback?: string[];
  };
}

export interface SecurityEventLogEntry extends LegalIntakeLogEntry {
  operation: LegalIntakeOperation.SECURITY_EVENT;
  metadata: {
    eventType: 'injection_attempt' | 'pii_detected' | 'validation_failed' | 'suspicious_input';
    severity: 'low' | 'medium' | 'high' | 'critical';
    details: Record<string, unknown>;
  };
}

/**
 * Legal Intake Logger for structured logging with correlation IDs
 */
export class LegalIntakeLogger {
  private static correlationIdCounter = 0;

  /**
   * Generates a unique correlation ID for tracking operations
   */
  static generateCorrelationId(): string {
    const timestamp = Date.now();
    const counter = ++this.correlationIdCounter;
    return `li_${timestamp}_${counter}_${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Logs agent start with comprehensive context
   */
  static logAgentStart(
    correlationId: string,
    sessionId: string | undefined,
    organizationId: string | undefined,
    messageCount: number,
    hasAttachments: boolean,
    attachmentCount?: number,
    organizationConfig?: { hasConfig: boolean; organizationSlug?: string }
  ): void {
    const logEntry: AgentStartLogEntry = {
      correlationId,
      operation: LegalIntakeOperation.AGENT_START,
      level: LegalIntakeLogLevel.AUDIT,
      timestamp: new Date().toISOString(),
      sessionId,
      organizationId,
      message: 'Legal intake agent started',
      metadata: {
        messageCount,
        hasAttachments,
        attachmentCount,
        organizationConfig
      }
    };

    this.logStructured(logEntry);
  }

  /**
   * Logs agent completion
   */
  static logAgentComplete(
    correlationId: string,
    sessionId: string | undefined,
    organizationId: string | undefined,
    duration: number,
    success: boolean,
    responseLength?: number
  ): void {
    const logEntry: LegalIntakeLogEntry = {
      correlationId,
      operation: LegalIntakeOperation.AGENT_COMPLETE,
      level: LegalIntakeLogLevel.AUDIT,
      timestamp: new Date().toISOString(),
      sessionId,
      organizationId,
      message: `Legal intake agent completed ${success ? 'successfully' : 'with errors'}`,
      duration,
      metadata: {
        success,
        responseLength
      }
    };

    this.logStructured(logEntry);
  }

  /**
   * Logs agent errors with detailed context
   */
  static logAgentError(
    correlationId: string,
    sessionId: string | undefined,
    organizationId: string | undefined,
    error: Error,
    context?: Record<string, unknown>
  ): void {
    const logEntry: LegalIntakeLogEntry = {
      correlationId,
      operation: LegalIntakeOperation.AGENT_ERROR,
      level: LegalIntakeLogLevel.ERROR,
      timestamp: new Date().toISOString(),
      sessionId,
      organizationId,
      message: `Legal intake agent error: ${error.message}`,
      error: {
        code: error.name,
        message: error.message,
        stack: error.stack
      },
      metadata: context
    };

    this.logStructured(logEntry);
  }

  /**
   * Logs state transitions for audit trail
   */
  static logStateTransition(
    correlationId: string,
    sessionId: string | undefined,
    organizationId: string | undefined,
    fromState: ConversationState,
    toState: ConversationState,
    trigger: string,
    contextSnapshot: Partial<ConversationContext>
  ): void {
    const logEntry: StateTransitionLogEntry = {
      correlationId,
      operation: LegalIntakeOperation.STATE_TRANSITION,
      level: LegalIntakeLogLevel.AUDIT,
      timestamp: new Date().toISOString(),
      sessionId,
      organizationId,
      message: `State transition: ${fromState} -> ${toState}`,
      metadata: {
        fromState,
        toState,
        trigger,
        contextSnapshot: this.sanitizeContextForLogging(contextSnapshot)
      }
    };

    this.logStructured(logEntry);
  }

  /**
   * Logs matter creation operations
   */
  static logMatterCreation(
    correlationId: string,
    sessionId: string | undefined,
    organizationId: string | undefined,
    operation: LegalIntakeOperation.MATTER_CREATION_START | LegalIntakeOperation.MATTER_CREATION_SUCCESS | LegalIntakeOperation.MATTER_CREATION_FAILED,
    matterType: string,
    context: MatterCreationContext,
    error?: Error
  ): void {
    const sanitizedData = this.sanitizePIIForLogging({
      name: context.name,
      email: context.email,
      phone: context.phone,
      location: context.location
    });

    const logEntry: MatterCreationLogEntry = {
      correlationId,
      operation,
      level: operation === LegalIntakeOperation.MATTER_CREATION_FAILED ? LegalIntakeLogLevel.ERROR : LegalIntakeLogLevel.AUDIT,
      timestamp: new Date().toISOString(),
      sessionId,
      organizationId,
      message: `Matter creation ${operation.split('_').pop()}: ${matterType}`,
      metadata: {
        matterType,
        hasName: context.hasName,
        hasEmail: context.hasEmail,
        hasPhone: context.hasPhone,
        hasLocation: context.hasLocation,
        hasDescription: Boolean(context.description),
        sanitizedData
      },
      error: error ? {
        code: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    };

    this.logStructured(logEntry);
  }

  /**
   * Logs tool call operations
   */
  static logToolCall(
    correlationId: string,
    sessionId: string | undefined,
    organizationId: string | undefined,
    operation: LegalIntakeOperation.TOOL_CALL_START | LegalIntakeOperation.TOOL_CALL_SUCCESS | LegalIntakeOperation.TOOL_CALL_FAILED,
    toolName: string,
    parameters?: Record<string, unknown>,
    result?: unknown,
    error?: Error
  ): void {
    const logEntry: ToolCallLogEntry = {
      correlationId,
      operation,
      level: operation === LegalIntakeOperation.TOOL_CALL_FAILED ? LegalIntakeLogLevel.ERROR : LegalIntakeLogLevel.AUDIT,
      timestamp: new Date().toISOString(),
      sessionId,
      organizationId,
      message: `Tool call ${operation.split('_').pop()}: ${toolName}`,
      metadata: {
        toolName,
        parameters: this.sanitizeParametersForLogging(parameters),
        result: this.sanitizeResultForLogging(result)
      },
      error: error ? {
        code: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    };

    this.logStructured(logEntry);
  }

  /**
   * Logs AI model interactions
   */
  static logAIModelCall(
    correlationId: string,
    sessionId: string | undefined,
    organizationId: string | undefined,
    operation: LegalIntakeOperation.AI_MODEL_CALL | LegalIntakeOperation.AI_MODEL_RESPONSE,
    model?: string,
    tokenCount?: number,
    responseLength?: number,
    processingTime?: number,
    provider?: string,
    fallback?: string[]
  ): void {
    const logEntry: AIModelLogEntry = {
      correlationId,
      operation,
      level: LegalIntakeLogLevel.INFO,
      timestamp: new Date().toISOString(),
      sessionId,
      organizationId,
      message: `AI model ${operation.split('_').pop()}`,
      metadata: {
        model,
        provider,
        tokenCount,
        responseLength,
        processingTime,
        fallback
      }
    };

    this.logStructured(logEntry);
  }

  /**
   * Logs security events
   */
  static logSecurityEvent(
    correlationId: string,
    sessionId: string | undefined,
    organizationId: string | undefined,
    eventType: 'injection_attempt' | 'pii_detected' | 'validation_failed' | 'suspicious_input',
    severity: 'low' | 'medium' | 'high' | 'critical',
    details: Record<string, unknown>
  ): void {
    const logEntry: SecurityEventLogEntry = {
      correlationId,
      operation: LegalIntakeOperation.SECURITY_EVENT,
      level: LegalIntakeLogLevel.ERROR,
      timestamp: new Date().toISOString(),
      sessionId,
      organizationId,
      message: `Security event: ${eventType}`,
      metadata: {
        eventType,
        severity,
        details: this.sanitizeSecurityDetails(details)
      }
    };

    this.logStructured(logEntry);
  }

  /**
   * Logs performance metrics
   */
  static logPerformance(
    correlationId: string,
    sessionId: string | undefined,
    organizationId: string | undefined,
    operation: string,
    duration: number,
    metadata?: Record<string, unknown>
  ): void {
    const logEntry: LegalIntakeLogEntry = {
      correlationId,
      operation: LegalIntakeOperation.CONVERSATION_ANALYSIS, // Using existing enum
      level: LegalIntakeLogLevel.INFO,
      timestamp: new Date().toISOString(),
      sessionId,
      organizationId,
      message: `Performance: ${operation}`,
      duration,
      metadata: {
        operation,
        ...metadata
      }
    };

    this.logStructured(logEntry);
  }

  /**
   * Core structured logging method
   */
  private static logStructured(logEntry: LegalIntakeLogEntry): void {
    const logLevel = logEntry.level.toUpperCase();
    const logMessage = `[${logLevel}] [${logEntry.operation}] ${logEntry.message}`;
    
    // Get environment from Logger or fallback to production
    let environment: string;
    try {
      environment = Logger.getEnvironment?.() || 'production';
    } catch (error) {
      // Fallback to production if Logger.getEnvironment throws (e.g., Logger not initialized)
      environment = 'production';
      // Log the error at debug level if available
      if (Logger.debug) {
        Logger.debug('Failed to get environment from Logger, falling back to production', { error });
      }
    }
    
    // Create a structured log object
    const structuredLog = {
      ...logEntry,
      // Add additional metadata for log aggregation
      service: 'legal-intake',
      version: '1.0.0',
      environment
    };

    // Use appropriate Logger method based on level
    switch (logEntry.level) {
      case LegalIntakeLogLevel.AUDIT:
        Logger.info(logMessage, structuredLog);
        break;
      case LegalIntakeLogLevel.INFO:
        Logger.info(logMessage, structuredLog);
        break;
      case LegalIntakeLogLevel.DEBUG:
        Logger.debug(logMessage, structuredLog);
        break;
      case LegalIntakeLogLevel.WARN:
        Logger.warn(logMessage, structuredLog);
        break;
      case LegalIntakeLogLevel.ERROR:
        Logger.error(logMessage, structuredLog);
        break;
    }
  }

  /**
   * Sanitizes PII data for logging
   */
  private static sanitizePIIForLogging(data: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (!value) {
        sanitized[key] = null;
        continue;
      }

      if (typeof value === 'string') {
        if (key === 'email' && value.includes('@')) {
          // Mask email: j***@example.com
          const [local, domain] = value.split('@');
          sanitized[key] = `${local.substring(0, 1)}***@${domain}`;
        } else if (key === 'phone') {
          // Mask phone: +1***-***-1234
          if (value.length > 4) {
            sanitized[key] = `${value.substring(0, 2)}***-***-${value.substring(value.length - 4)}`;
          } else {
            sanitized[key] = '***';
          }
        } else if (key === 'name') {
          // Mask name: J*** D***
          const parts = value.split(' ');
          sanitized[key] = parts.map(part => 
            part.length > 1 ? `${part[0]}***` : part
          ).join(' ');
        } else {
          // Truncate other strings
          sanitized[key] = value.length > 20 ? `${value.substring(0, 20)}...` : value;
        }
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Sanitizes context data for logging
   */
  private static sanitizeContextForLogging(context: Partial<ConversationContext>): Partial<ConversationContext> {
    return {
      hasLegalIssue: context.hasLegalIssue,
      hasOpposingParty: context.hasOpposingParty,
      isSensitiveMatter: context.isSensitiveMatter,
      isGeneralInquiry: context.isGeneralInquiry,
      shouldCreateMatter: context.shouldCreateMatter,
      state: context.state,
      isQualifiedLead: context.isQualifiedLead
      // Exclude actual PII values and lead qualification details
    };
  }

  /**
   * Sanitizes tool parameters for logging
   */
  private static sanitizeParametersForLogging(parameters?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!parameters) return undefined;

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string') {
        // Truncate long strings
        sanitized[key] = value.length > 100 ? `${value.substring(0, 100)}...` : value;
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * Sanitizes tool results for logging
   */
  private static sanitizeResultForLogging(result?: unknown): unknown {
    if (!result) return undefined;
    
    if (typeof result === 'string') {
      return result.length > 200 ? `${result.substring(0, 200)}...` : result;
    }
    
    if (typeof result === 'object') {
      return { type: 'object', keys: Object.keys(result) };
    }
    
    return result;
  }

  /**
   * Sanitizes security event details
   */
  private static sanitizeSecurityDetails(details: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(details)) {
      if (typeof value === 'string') {
        // Remove or mask potentially sensitive content
        sanitized[key] = value.length > 50 ? `${value.substring(0, 50)}...` : value;
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
}
