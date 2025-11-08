import { validateLocation as validateLocationUtil } from '../utils/locationValidator';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export class ValidationService {
  /**
   * Validates a phone number using NANP (North American Numbering Plan) rules
   */
  static validatePhone(phone: string): ValidationResult {
    if (!phone || phone.trim() === '') {
      return { isValid: false, error: 'Phone number is required' };
    }
    
    try {
      // Remove extension suffixes first (e.g., "x123", "ext.123", "ext 123")
      const withoutExtension = phone.replace(/\s*(?:x|ext\.?|extension)\s*\d+$/i, '');
      
      // Block alphanumeric phone numbers (like 1-800-FLOWERS) - check after extension removal
      if (/[a-zA-Z]/.test(withoutExtension)) {
        return { isValid: false, error: 'Phone numbers cannot contain letters' };
      }
      
      // Block common placeholder/test numbers in production - use cleaned version without extension
      const blockedNumbers = [
        '555-555-5555', '5555555555', '555-123-4567', '5551234567',
        '123-456-7890', '1234567890', '000-000-0000', '0000000000',
        '111-111-1111', '1111111111', '999-999-9999', '9999999999'
      ];
      
      const cleanedForBlocking = withoutExtension.replace(/\D/g, '');
      if (blockedNumbers.some(blocked => blocked.replace(/\D/g, '') === cleanedForBlocking)) {
        return { isValid: false, error: 'Please provide a real phone number, not a placeholder' };
      }
      
      // Clean the phone number - remove all non-digit characters
      const cleaned = withoutExtension.replace(/\D/g, '');
      
      // Validate length - must be 10 or 11 digits
      if (cleaned.length < 10 || cleaned.length > 11) {
        return { isValid: false, error: 'Phone number must be 10 or 11 digits' };
      }
      
      // NANP validation patterns
      // Area code: [2-9]\d{2} (starts with 2-9, followed by 2 digits)
      // Exchange code: [2-9]\d{2} (starts with 2-9, followed by 2 digits)  
      // Subscriber number: \d{4} (4 digits)
      
      let normalizedNumber: string;
      
      // Handle 11-digit numbers with country code
      if (cleaned.length === 11 && cleaned.startsWith('1')) {
        normalizedNumber = cleaned.substring(1); // Remove leading '1'
      } else if (cleaned.length === 10) {
        normalizedNumber = cleaned;
      } else {
        return { isValid: false, error: 'Invalid phone number format' };
      }
      
      // Validate NANP structure: area code + exchange + subscriber
      const nanpPattern = /^([2-9]\d{2})([2-9]\d{2})(\d{4})$/;
      const match = normalizedNumber.match(nanpPattern);
      
      if (!match) {
        return { isValid: false, error: 'Invalid phone number format' };
      }
      
      // Additional validation: ensure area code and exchange code are valid
      const [, areaCode, exchangeCode, subscriber] = match;
      
      // Area code cannot be 0 or 1, and exchange code cannot be 0 or 1
      if (areaCode.startsWith('0') || areaCode.startsWith('1') || 
          exchangeCode.startsWith('0') || exchangeCode.startsWith('1')) {
        return { isValid: false, error: 'Invalid phone number format' };
      }
      
      // Block 555 exchange code with fictional subscriber numbers
      if (exchangeCode === '555') {
        // Block fictional subscriber range 0100-0199 and special 1212
        // First check if subscriber contains only digits
        if (/^\d+$/.test(subscriber)) {
          const subscriberNum = parseInt(subscriber, 10);
          if ((subscriberNum >= 100 && subscriberNum <= 199) || subscriber === '1212') {
            return { isValid: false, error: 'Please provide a real phone number, not a placeholder' };
          }
        }
      }
      
      return { isValid: true };
    } catch (error) {
      console.error('Phone validation error:', error);
      return { isValid: false, error: 'Phone validation error' };
    }
  }

  /**
   * Validates an email address format
   */
  static validateEmail(email: string): boolean {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  /**
   * Validates a person's name
   */
  static validateName(name: string): boolean {
    if (!name) return false;
    const trimmedName = name.trim();
    return trimmedName.length >= 2 && trimmedName.length <= 100;
  }

  /**
   * Validates a location string
   */
  static validateLocation(location: string): boolean {
    if (!location) return false;
    const locationInfo = validateLocationUtil(location);
    return locationInfo.isValid;
  }

  /**
   * Checks if contact information contains placeholder values
   */
  static hasPlaceholderValues(phone?: string, email?: string): boolean {
    const placeholderPatterns = [/\[user_phone\]/i, /\[user_email\]/i];
    const emptyTokens = new Set(['', 'none', 'null', 'n/a', 'na', 'tbd', 'unknown']);
    const isEmptyish = (v?: string) => {
      if (v == null) return false;
      const t = v.trim().toLowerCase();
      return emptyTokens.has(t);
    };

    // Check phone for placeholders
    if (phone) {
      const trimmedPhone = phone.trim();
      if (isEmptyish(trimmedPhone)) return true;
      if (placeholderPatterns.some(pattern => pattern.test(trimmedPhone))) return true;
    }

    // Check email for placeholders
    if (email) {
      const trimmedEmail = email.trim();
      if (isEmptyish(trimmedEmail)) return true;
      if (placeholderPatterns.some(pattern => pattern.test(trimmedEmail))) return true;
    }

    return false;
  }

  /**
   * Validates matter type is not a placeholder
   */
  static validateMatterType(matterType: string): boolean {
    if (!matterType) return false;
    const invalidTypes = ['Unknown', 'unknown', 'None', 'null', ''];
    return !invalidTypes.includes(matterType.trim());
  }
}
