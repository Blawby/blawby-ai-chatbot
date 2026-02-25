/**
 * Onboarding field types - Extracted from PracticeSetup for better separation
 */

export interface ExtractedFields {
  name?: string;
  slug?: string;
  description?: string;
  introMessage?: string;
  accentColor?: string;
  website?: string;
  contactPhone?: string;
  businessEmail?: string;
  address?: {
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  isRemote?: boolean; // New field to track remote practices
  services?: Array<{ name: string; description?: string; key?: string }>;
  completionScore?: number;
  missingFields?: string[];
}
