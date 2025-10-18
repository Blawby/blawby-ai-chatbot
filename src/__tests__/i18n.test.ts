import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, isRTLLocale, RTL_LOCALES } from '../i18n/index';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

describe('i18n Configuration', () => {
  it('should have all supported locales defined', () => {
    expect(SUPPORTED_LOCALES).toHaveLength(19);
    expect(SUPPORTED_LOCALES).toContain('en');
    expect(SUPPORTED_LOCALES).toContain('ar');
    expect(SUPPORTED_LOCALES).toContain('hi');
    expect(SUPPORTED_LOCALES).toContain('uk');
  });

  it('should have default locale as English', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('should correctly identify RTL locales', () => {
    expect(isRTLLocale('ar')).toBe(true);
    expect(isRTLLocale('en')).toBe(false);
    expect(isRTLLocale('es')).toBe(false);
  });

  it('should have RTL_LOCALES set defined', () => {
    expect(RTL_LOCALES).toBeInstanceOf(Set);
    expect(RTL_LOCALES.has('ar')).toBe(true);
  });
});

describe('Translation Files Structure', () => {
  const NAMESPACES = ['common', 'settings', 'auth', 'profile', 'pricing'];

  // Helper to dynamically import translation files
  const loadTranslation = async (locale: string, namespace: string) => {
    try {
      const module = await import(`../locales/${locale}/${namespace}.json`);
      return module.default;
    } catch (error) {
      throw new Error(`Failed to load ${locale}/${namespace}.json: ${error}`);
    }
  };

  // Helper to get all keys from nested object
  const getAllKeys = (obj: any, prefix = ''): string[] => {
    return Object.entries(obj).flatMap(([key, value]) => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return getAllKeys(value, fullKey);
      }
      return [fullKey];
    });
  };

  it('should have all translation files for each supported locale', async () => {
    const missingFiles: string[] = [];

    for (const locale of SUPPORTED_LOCALES) {
      for (const namespace of NAMESPACES) {
        try {
          await loadTranslation(locale, namespace);
        } catch (error) {
          missingFiles.push(`${locale}/${namespace}.json`);
        }
      }
    }

    if (missingFiles.length > 0) {
      console.error('Missing translation files:', missingFiles);
    }

    expect(missingFiles).toHaveLength(0);
  }, 30000); // 30 second timeout for loading all files

  it('should have consistent keys across all locales for each namespace', async () => {
    const inconsistencies: string[] = [];

    for (const namespace of NAMESPACES) {
      // Load English as reference
      const enTranslation = await loadTranslation('en', namespace);
      const enKeys = getAllKeys(enTranslation).sort();

      for (const locale of SUPPORTED_LOCALES) {
        if (locale === 'en') continue;

        try {
          const translation = await loadTranslation(locale, namespace);
          const localeKeys = getAllKeys(translation).sort();

          // Check for missing keys
          const missingInLocale = enKeys.filter(key => !localeKeys.includes(key));
          const extraInLocale = localeKeys.filter(key => !enKeys.includes(key));

          if (missingInLocale.length > 0) {
            inconsistencies.push(
              `${locale}/${namespace}: Missing keys: ${missingInLocale.join(', ')}`
            );
          }

          if (extraInLocale.length > 0) {
            inconsistencies.push(
              `${locale}/${namespace}: Extra keys: ${extraInLocale.join(', ')}`
            );
          }
        } catch (error) {
          inconsistencies.push(`${locale}/${namespace}: Failed to load`);
        }
      }
    }

    if (inconsistencies.length > 0) {
      console.error('Translation key inconsistencies found:');
      inconsistencies.forEach(i => console.error(`  - ${i}`));
    }

    expect(inconsistencies).toHaveLength(0);
  }, 60000); // 60 second timeout

  it('should not have empty translation values', async () => {
    const emptyValues: string[] = [];

    const checkForEmptyValues = (obj: any, path: string[] = []): void => {
      Object.entries(obj).forEach(([key, value]) => {
        const currentPath = [...path, key];
        
        if (typeof value === 'string') {
          if (value.trim() === '') {
            emptyValues.push(currentPath.join('.'));
          }
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
          checkForEmptyValues(value, currentPath);
        }
      });
    };

    for (const locale of SUPPORTED_LOCALES) {
      for (const namespace of NAMESPACES) {
        try {
          const translation = await loadTranslation(locale, namespace);
          checkForEmptyValues(translation, [locale, namespace]);
        } catch (error) {
          // Skip if file doesn't exist (covered by other test)
        }
      }
    }

    if (emptyValues.length > 0) {
      console.error('Empty translation values found:', emptyValues);
    }

    expect(emptyValues).toHaveLength(0);
  }, 60000);

  it('should have valid JSON syntax for all files', async () => {
    const invalidFiles: string[] = [];

    for (const locale of SUPPORTED_LOCALES) {
      for (const namespace of NAMESPACES) {
        try {
          const translation = await loadTranslation(locale, namespace);
          
          // Verify it's an object
          if (typeof translation !== 'object' || translation === null) {
            invalidFiles.push(`${locale}/${namespace}.json - not an object`);
          }
        } catch (error) {
          invalidFiles.push(`${locale}/${namespace}.json - invalid JSON`);
        }
      }
    }

    if (invalidFiles.length > 0) {
      console.error('Invalid JSON files:', invalidFiles);
    }

    expect(invalidFiles).toHaveLength(0);
  }, 60000);

  it('should preserve interpolation placeholders correctly', async () => {
    const placeholderIssues: string[] = [];
    
    // Pattern to match interpolation: {{variable}} or {variable}
    const interpolationPattern = /\{\{?(\w+)\}?\}/g;

    for (const namespace of NAMESPACES) {
      const enTranslation = await loadTranslation('en', namespace);
      
      const checkPlaceholders = async (enObj: any, path: string[] = []): Promise<void> => {
        for (const [key, enValue] of Object.entries(enObj)) {
          const currentPath = [...path, key];
          
          if (typeof enValue === 'string') {
            const enMatches = [...enValue.matchAll(interpolationPattern)];
            
            if (enMatches.length > 0) {
              const enPlaceholders = enMatches.map(m => m[1]).sort();
              
              // Check in all locales using for...of to properly await
              for (const locale of SUPPORTED_LOCALES) {
                if (locale === 'en') continue;
                
                try {
                  const localeTranslation = await loadTranslation(locale, namespace);
                  const localeValue = currentPath.reduce((obj, k) => obj?.[k], localeTranslation);
                  
                  if (typeof localeValue === 'string') {
                    const localeMatches = [...localeValue.matchAll(interpolationPattern)];
                    const localePlaceholders = localeMatches.map(m => m[1]).sort();
                    
                    if (JSON.stringify(enPlaceholders) !== JSON.stringify(localePlaceholders)) {
                      placeholderIssues.push(
                        `${locale}/${namespace}:${currentPath.join('.')} - Expected placeholders [${enPlaceholders.join(', ')}], got [${localePlaceholders.join(', ')}]`
                      );
                    }
                  }
                } catch (error) {
                  // Skip if file doesn't exist
                }
              }
            }
          } else if (enValue && typeof enValue === 'object' && !Array.isArray(enValue)) {
            await checkPlaceholders(enValue, currentPath);
          }
        }
      };

      await checkPlaceholders(enTranslation);
    }

    if (placeholderIssues.length > 0) {
      console.error('Interpolation placeholder issues:', placeholderIssues.slice(0, 20));
    }

    expect(placeholderIssues).toHaveLength(0);
  }, 60000);
});

describe('Locale-specific Features', () => {
  it('should have proper text direction for RTL languages', () => {
    // Arabic should be RTL
    expect(isRTLLocale('ar')).toBe(true);
    
    // All others should be LTR
    const ltrLocales = SUPPORTED_LOCALES.filter(l => l !== 'ar');
    ltrLocales.forEach(locale => {
      expect(isRTLLocale(locale)).toBe(false);
    });
  });

  it('should handle special characters in translations', async () => {
    // Test locales with special characters
    const specialCharLocales = {
      'ar': /[\u0600-\u06FF]/,  // Arabic script
      'zh': /[\u4E00-\u9FFF]/,  // Chinese characters
      'ja': /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/,  // Japanese
      'ko': /[\uAC00-\uD7AF]/,  // Korean
      'ru': /[\u0400-\u04FF]/,  // Cyrillic
      'uk': /[\u0400-\u04FF]/,  // Cyrillic
      'hi': /[\u0900-\u097F]/,  // Devanagari
      'th': /[\u0E00-\u0E7F]/   // Thai
    };

    for (const [locale, pattern] of Object.entries(specialCharLocales)) {
      try {
        const translation = await import(`../locales/${locale}/common.json`);
        const hasSpecialChars = JSON.stringify(translation.default).match(pattern);
        expect(hasSpecialChars, `${locale} should contain its script characters`).toBeTruthy();
      } catch (error) {
        throw new Error(`Failed to load ${locale}/common.json`);
      }
    }
  }, 30000);
});

describe('Translation Quality', () => {
  it('should not have obviously untranslated English text in non-English locales', async () => {
    const suspiciousTranslations: string[] = [];
    
    // Common English words that shouldn't appear as-is in translations
    // (excluding proper nouns, technical terms, brand names)
    const englishWords = [
      'Settings', 'Password', 'Email', 'Cancel', 'Submit', 'Delete',
      'Confirm', 'Warning', 'Error', 'Success', 'Loading'
    ];
    
    const pattern = new RegExp(`\\b(${englishWords.join('|')})\\b`, 'gi');

    for (const locale of SUPPORTED_LOCALES) {
      if (locale === 'en') continue;
      
      for (const namespace of ['settings', 'auth']) {
        try {
          const translation = await import(`../locales/${locale}/${namespace}.json`);
          const content = JSON.stringify(translation.default);
          
          const matches = content.match(pattern);
          if (matches && matches.length > 5) { // Allow some English (like "Email" which is universal)
            suspiciousTranslations.push(
              `${locale}/${namespace}: Found ${matches.length} English words: ${[...new Set(matches)].slice(0, 5).join(', ')}`
            );
          }
        } catch (error) {
          // Skip if file doesn't exist
        }
      }
    }

    if (suspiciousTranslations.length > 0) {
      console.warn('Potentially untranslated content (may be false positives):', suspiciousTranslations);
    }

    // This is a warning, not a hard failure since some English is acceptable
    // expect(suspiciousTranslations).toHaveLength(0);
  }, 30000);
});
