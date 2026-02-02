import { z } from 'zod';
import type { Address } from '../types/ui';

/**
 * Address validation schema (loose validation for contact forms)
 * Aligns with the shared Address type from src/shared/types/ui
 */
const addressSchema = z.custom<Address>((data) => {
  if (!data || typeof data !== 'object') return false;
  
  const address = data as Address;
  
  // Basic validation - all fields are optional in loose validation
  if (address.address && typeof address.address !== 'string') return false;
  if (address.apartment && typeof address.apartment !== 'string') return false;
  if (address.city && typeof address.city !== 'string') return false;
  if (address.state && typeof address.state !== 'string') return false;
  if (address.postalCode && typeof address.postalCode !== 'string') return false;
  if (address.country && typeof address.country !== 'string') return false;
  
  return true;
}).optional();

/**
 * Contact data validation schema
 * Matches the frontend validation in src/components/ui/validation/schemas.ts
 */
export const contactDataSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  email: z.string().email('Valid email is required').trim(),
  phone: z.string()
    .regex(/^[\d\s\-()]+$/, 'Phone must contain only digits, spaces, hyphens, and parentheses')
    .min(10, 'Phone number must be at least 10 digits')
    .optional()
    .or(z.literal('')),
  address: addressSchema,
  opposingParty: z.string().optional().or(z.literal('')),
  description: z.string().optional().or(z.literal(''))
});

export type ContactData = z.infer<typeof contactDataSchema>;

/**
 * Parse and validate contact data from formatted message content
 * Handles various line ending formats (LF, CRLF) and whitespace variations
 */
export function parseContactData(content: string): ContactData | null {
  const lines = content.split(/\r?\n/).map(line => line.trim());
  
  const contactData: Partial<ContactData> = {};
  
  // Extract each field separately with flexible matching
  for (const line of lines) {
    const nameMatch = line.match(/^Name:\s*(.+)$/i);
    if (nameMatch) contactData.name = nameMatch[1].trim();
    
    const emailMatch = line.match(/^Email:\s*(.+)$/i);
    if (emailMatch) contactData.email = emailMatch[1].trim();
    
    const phoneMatch = line.match(/^Phone:\s*(.+)$/i);
    if (phoneMatch) contactData.phone = phoneMatch[1].trim();
    
    // Parse address lines (could be multiline address)
    const addressMatch = line.match(/^Address:\s*(.+)$/i);
    if (addressMatch) {
      // For now, store as simple address string parsing
      // In a full implementation, this would parse multiline addresses
      const addressText = addressMatch[1].trim();
      contactData.address = {
        address: addressText,
        apartment: undefined,
        city: undefined,
        state: undefined,
        postalCode: undefined,
        country: undefined
        // Note: This is a partial/incomplete address that requires enrichment
      };
    }
    
    const opposingMatch = line.match(/^Opposing Party:\s*(.+)$/i);
    if (opposingMatch) contactData.opposingParty = opposingMatch[1].trim();

    const descriptionMatch = line.match(/^Description:\s*(.+)$/i);
    if (descriptionMatch) contactData.description = descriptionMatch[1].trim();
  }
  
  // Validate using Zod schema
  const result = contactDataSchema.safeParse(contactData);
  
  if (!result.success) {
    console.error('[ContactData] Validation failed:', result.error.issues);
    return null;
  }
  
  return result.data;
}
