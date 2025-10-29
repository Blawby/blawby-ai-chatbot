/**
 * Centralized matter analysis utilities
 * Provides consistent analysis of matter completeness and missing information
 */

import { MatterData } from '../types/matter';
import { SUMMARY_MIN_LENGTH } from './constants';

/**
 * Analyze matter content to identify missing information
 * This is the single source of truth for matter analysis across the application
 */
export function analyzeMissingInfo(matterData: MatterData): string[] {
  const missingInfo: string[] = [];
  
  // Normalize matter summary upfront to avoid repeated operations and null/undefined issues
  const summary = (matterData.matterSummary || '').trim();
  const summaryLower = summary.toLowerCase();
  
  // Check if matter summary is empty or very basic
  if (summary.length < SUMMARY_MIN_LENGTH) {
    missingInfo.push('Detailed matter description');
  }
  
  // Check for timeline information
  const timelinePattern = /\b(?:when|date|timeline|time|schedule|deadline|occurred|happened|event|incident|period|duration|timing)\b/i;
  if (!timelinePattern.test(summary)) {
    missingInfo.push('Timeline of events');
  }
  
  // Check for location information
  const locationPattern = /\b(?:where|location|state|venue|address|city|county|place|site|area|region|jurisdiction|court|building|office|home|workplace)\b/i;
  if (!locationPattern.test(summary)) {
    missingInfo.push('Location/venue information');
  }
  
  // Check for evidence/documentation
  const documentPattern = /\b(?:document|evidence|proof|attachment|invoice|report|record|file|paperwork|contract|agreement|receipt|statement|correspondence|email|letter|photo|image|video|audio|recording)\b/i;
  if (!documentPattern.test(summary)) {
    missingInfo.push('Supporting documents or evidence');
  }
  
  // Cache service.toLowerCase() to avoid repeated calls
  const serviceLower = (matterData.service || '').toLowerCase();
  
  // Service-specific checks
  if (serviceLower.includes('family')) {
    if (!summaryLower.includes('child') && !summaryLower.includes('children') && !summaryLower.includes('custody')) {
      missingInfo.push('Information about children (if applicable)');
    }
    if (!summaryLower.includes('marriage') && !summaryLower.includes('divorce') && !summaryLower.includes('relationship')) {
      missingInfo.push('Relationship/marriage details');
    }
  }
  
  if (serviceLower.includes('employment')) {
    if (!summaryLower.includes('employer') && !summaryLower.includes('company') && !summaryLower.includes('workplace')) {
      missingInfo.push('Employer/company information');
    }
    if (!summaryLower.includes('employee') && !summaryLower.includes('worker') && !summaryLower.includes('position')) {
      missingInfo.push('Employment status details');
    }
  }
  
  if (serviceLower.includes('business')) {
    if (!summaryLower.includes('business') && !summaryLower.includes('company') && !summaryLower.includes('entity')) {
      missingInfo.push('Business entity information');
    }
    if (!summaryLower.includes('contract') && !summaryLower.includes('agreement') && !summaryLower.includes('partnership')) {
      missingInfo.push('Contract or agreement details');
    }
  }
  
  if (serviceLower.includes('tenant') || serviceLower.includes('landlord')) {
    if (!summaryLower.includes('lease') && !summaryLower.includes('rental') && !summaryLower.includes('property')) {
      missingInfo.push('Lease or rental agreement details');
    }
    if (!summaryLower.includes('landlord') && !summaryLower.includes('tenant') && !summaryLower.includes('property manager')) {
      missingInfo.push('Landlord/tenant information');
    }
  }
  
  if (serviceLower.includes('probate')) {
    if (!summaryLower.includes('will') && !summaryLower.includes('estate') && !summaryLower.includes('inheritance')) {
      missingInfo.push('Will or estate information');
    }
    if (!summaryLower.includes('beneficiary') && !summaryLower.includes('heir') && !summaryLower.includes('inheritance')) {
      missingInfo.push('Beneficiary information');
    }
  }
  
  if (serviceLower.includes('education') || serviceLower.includes('special education')) {
    if (!summaryLower.includes('school') && !summaryLower.includes('district') && !summaryLower.includes('education')) {
      missingInfo.push('School or district information');
    }
    if (!summaryLower.includes('iep') && !summaryLower.includes('plan') && !summaryLower.includes('accommodation')) {
      missingInfo.push('IEP or accommodation plan details');
    }
  }
  
  // Check for urgency if not specified (optional property)
  // Cast matterData to Record<string, unknown> once and extract urgency
  const matterDataRecord = matterData as unknown as Record<string, unknown>;
  const urgency = matterDataRecord.urgency as string | undefined;
  if (!urgency || urgency.toLowerCase() === 'unknown') {
    missingInfo.push('Matter urgency level');
  }
  
  // Check for jurisdiction if not specified (optional property)
  if (!matterDataRecord.jurisdiction) {
    missingInfo.push('Jurisdiction information');
  }
  
  return missingInfo;
}

/**
 * Determine if a matter is complete enough to proceed
 */
export function isMatterComplete(matterData: MatterData): boolean {
  const missingInfo = analyzeMissingInfo(matterData);
  return missingInfo.length === 0;
}

/**
 * Get a user-friendly description of missing information
 */
export function getMissingInfoDescription(missingInfo: string[]): string {
  if (missingInfo.length === 0) {
    return 'Your matter appears to be complete with all necessary information.';
  }
  
  if (missingInfo.length === 1) {
    return `To strengthen your matter, consider providing: ${missingInfo[0]}`;
  }
  
  return `To strengthen your matter, consider providing:\n\n${missingInfo.map(info => `• ${info}`).join('\n')}`;
}
