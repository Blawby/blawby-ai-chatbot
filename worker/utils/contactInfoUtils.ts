/**
 * Centralized utilities for contact information detection and validation
 */

import type { Address } from '../types/ui';

export interface ContactInfoPatterns {
  name: RegExp;
  email: RegExp;
  phone: RegExp;
  address: RegExp;
  contactInfoHeader: RegExp;
}

export interface ContactInfoMatch {
  hasName: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  hasAddress: boolean;
  hasContactInfoHeader: boolean;
  matches: Array<{ pattern: string; matched: boolean }>;
}

/**
 * Standard contact information detection patterns
 */
export const CONTACT_INFO_PATTERNS: ContactInfoPatterns = {
  // Contact info header patterns
  contactInfoHeader: /Contact Information:/i,
  
  // Name patterns - more flexible to catch various formats
  name: /Name:\s*.+/i,
  
  // Email patterns - standard email format
  email: /Email:\s*\S+@\S+\.\S+/i,
  
  // Phone patterns - flexible format matching
  phone: /Phone:\s*.+/i,
  
  // Address patterns - flexible address matching
  address: /Address:\s*.+/i
};

/**
 * Detects contact information in conversation text
 * @param conversationText - The conversation text to analyze
 * @returns ContactInfoMatch with detection results
 */
export function detectContactInfo(conversationText: string): ContactInfoMatch {
  if (!conversationText) {
    return {
      hasName: false,
      hasEmail: false,
      hasPhone: false,
      hasAddress: false,
      hasContactInfoHeader: false,
      matches: []
    };
  }

  const patterns = CONTACT_INFO_PATTERNS;
  const matches = [
    { pattern: 'contactInfoHeader', matched: patterns.contactInfoHeader.test(conversationText) },
    { pattern: 'name', matched: patterns.name.test(conversationText) },
    { pattern: 'email', matched: patterns.email.test(conversationText) },
    { pattern: 'phone', matched: patterns.phone.test(conversationText) },
    { pattern: 'address', matched: patterns.address.test(conversationText) }
  ];

  return {
    hasName: matches.find(m => m.pattern === 'name')?.matched || false,
    hasEmail: matches.find(m => m.pattern === 'email')?.matched || false,
    hasPhone: matches.find(m => m.pattern === 'phone')?.matched || false,
    hasAddress: matches.find(m => m.pattern === 'address')?.matched || false,
    hasContactInfoHeader: matches.find(m => m.pattern === 'contactInfoHeader')?.matched || false,
    matches
  };
}

/**
 * Determines if contact information has been provided in the conversation
 * @param conversationText - The conversation text to analyze
 * @returns boolean indicating if contact info is present
 */
export function hasContactInformation(conversationText: string): boolean {
  const detection = detectContactInfo(conversationText);
  
  // Consider contact info present if we have at least name, email, and phone
  // OR if we have the contact info header with at least 2 other fields
  const hasCoreInfo = detection.hasName && detection.hasEmail && detection.hasPhone;
  const hasHeaderWithInfo = detection.hasContactInfoHeader && 
    [detection.hasName, detection.hasEmail, detection.hasPhone, detection.hasAddress]
      .filter(Boolean).length >= 2;
  
  return hasCoreInfo || hasHeaderWithInfo;
}

// Export alias for backward compatibility
export const hasContactInfo = hasContactInformation;

/**
 * Extracts contact information from conversation text
 * @param conversationText - The conversation text to analyze
 * @returns Object with extracted contact information
 */
export function extractContactInfo(conversationText: string): {
  name?: string;
  email?: string;
  phone?: string;
  address?: Address;
} {
  if (!conversationText) {
    return {};
  }

  const result: { name?: string; email?: string; phone?: string; address?: Address } = {};

  // Extract name
  const nameMatch = conversationText.match(/Name:\s*(.+?)(?:\n|$)/i);
  if (nameMatch) {
    result.name = nameMatch[1].trim();
  }

  // Extract email
  const emailMatch = conversationText.match(/Email:\s*(\S+@\S+\.\S+)/i);
  if (emailMatch) {
    result.email = emailMatch[1].trim();
  }

  // Extract phone
  const phoneMatch = conversationText.match(/Phone:\s*(.+?)(?:\n|$)/i);
  if (phoneMatch) {
    result.phone = phoneMatch[1].trim();
  }

  // Extract address
  const addressMatch = conversationText.match(/Address:\s*(.+?)(?:\n|$)/i);
  if (addressMatch) {
    const addressText = addressMatch[1].trim();
    result.address = {
      address: addressText,
      apartment: '',
      city: '',
      state: '',
      postalCode: '',
      country: ''
    };
  }

  return result;
}

/**
 * Validates that contact information is complete enough for matter creation
 * @param conversationText - The conversation text to analyze
 * @returns boolean indicating if contact info is sufficient
 */
export function isContactInfoComplete(conversationText: string): boolean {
  const detection = detectContactInfo(conversationText);
  
  // Require at least name, email, and phone for complete contact info
  return detection.hasName && detection.hasEmail && detection.hasPhone;
}

/**
 * Logs contact information detection for debugging
 * @param conversationText - The conversation text that was analyzed
 * @param detection - The detection results
 * @param correlationId - Optional correlation ID for logging
 */
export function logContactInfoDetection(
  conversationText: string, 
  detection: ContactInfoMatch, 
  correlationId?: string,
  env?: { NODE_ENV?: string }
): void {
  // Only log in non-production environments or when debug is enabled
  // Use env.NODE_ENV for Cloudflare Workers compatibility
  const isProduction = env?.NODE_ENV === 'production';
  
  if (isProduction) {
    return;
  }

  // Parameter validation with graceful handling
  if (typeof conversationText !== 'string') {
    console.warn('logContactInfoDetection: conversationText must be a string');
    return;
  }
  if (!detection || typeof detection !== 'object') {
    console.warn('logContactInfoDetection: detection must be a ContactInfoMatch object');
    return;
  }

  // Redact PII from conversation text
  const redactedText = conversationText
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]')
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE_REDACTED]')
    .replace(/Name:\s*.+/gi, 'Name: [NAME_REDACTED]')
    .replace(/Address:\s*.+/gi, 'Address: [ADDRESS_REDACTED]')
    .substring(0, 200);

  // Create sanitized detection object without raw PII
  const sanitizedDetection = {
    hasName: detection.hasName,
    hasEmail: detection.hasEmail,
    hasPhone: detection.hasPhone,
    hasAddress: detection.hasAddress,
    hasContactInfoHeader: detection.hasContactInfoHeader,
    // Include PII-safe pattern information from matches array
    matchedPatterns: detection.matches
      .filter(match => match.matched)
      .map(match => match.pattern)
  };

  // Use structured logging with Logger instead of console.log
  const logData = {
    message: 'Contact information detection',
    correlationId,
    hasContactInfo: hasContactInformation(conversationText),
    isComplete: isContactInfoComplete(conversationText),
    detection: sanitizedDetection,
    conversationText: redactedText + (conversationText.length > 200 ? '...' : '')
  };
  
  console.log('Contact information detection:', JSON.stringify(logData));
}
