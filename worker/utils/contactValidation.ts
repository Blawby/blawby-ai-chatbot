import { z } from 'zod';
import type { Address } from '../types/ui';

/**
 * Address validation schema (loose validation for contact forms)
 */
const addressSchema = z.object({
  address: z.string().optional(),
  apartment: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
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
        apartment: '',
        city: '',
        state: '',
        postalCode: '',
        country: ''
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
