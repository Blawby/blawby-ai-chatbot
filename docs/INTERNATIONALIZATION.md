# Internationalization (i18n) Guide

## Overview

The Blawby AI Chatbot supports **19 languages** across the globe, with comprehensive Right-to-Left (RTL) support for Arabic. Our i18n implementation uses `i18next` with React integration and provides a seamless multilingual experience.

## Supported Languages

### Current Languages (19 Total)

We support 19 configured locales. The UI language selector displays only languages with ≥90% translation completion; the remaining locales are template-only and hidden until completed.

| Language | Code | Regions | Native Speakers | Translation Status | UI Visible |
|----------|------|---------|-----------------|-------------------|------------|
| English | `en` | Global | 1.5B+ | 100% Complete | ✅ Yes |
| Spanish | `es` | Americas, Europe | 500M+ | ~95% Complete | ✅ Yes |
| French | `fr` | Europe, Africa | 300M+ | ~95% Complete | ✅ Yes |
| German | `de` | Central Europe | 130M+ | ~95% Complete | ✅ Yes |
| Chinese | `zh` | Asia | 1.3B+ | ~95% Complete | ✅ Yes |
| Japanese | `ja` | Japan | 125M+ | ~95% Complete | ✅ Yes |
| Vietnamese | `vi` | Southeast Asia | 85M+ | ~95% Complete | ✅ Yes |
| **Portuguese** | `pt` | Brazil, Portugal, Africa | 250M+ | ~92% Complete | ✅ Yes |
| **Arabic** | `ar` | Middle East, North Africa | 400M+ | ~92% Complete (RTL) | ✅ Yes |
| **Russian** | `ru` | Eastern Europe, Central Asia | 260M+ | ~85% Template | ⏳ Hidden |
| **Italian** | `it` | Italy, Europe | 85M+ | ~85% Template | ⏳ Hidden |
| **Korean** | `ko` | Korea | 80M+ | ~85% Template | ⏳ Hidden |
| **Dutch** | `nl` | Netherlands, Belgium | 25M+ | ~85% Template | ⏳ Hidden |
| **Polish** | `pl` | Poland, Europe | 45M+ | ~85% Template | ⏳ Hidden |
| **Turkish** | `tr` | Turkey, Cyprus | 85M+ | ~85% Template | ⏳ Hidden |
| **Thai** | `th` | Thailand | 70M+ | ~85% Template | ⏳ Hidden |
| **Indonesian** | `id` | Indonesia | 200M+ | ~85% Template | ⏳ Hidden |
| **Hindi** | `hi` | India | 600M+ | ~85% Template | ⏳ Hidden |
| **Ukrainian** | `uk` | Ukraine | 45M+ | ~85% Template | ⏳ Hidden |

**Total Reach:** 5+ billion native speakers  
**Global Coverage:** 90%+ of internet users  
**UI Available:** 9 languages (≥90% complete)  
**In Development:** 10 languages (templates ready for translation)

### Language Coverage by Region

#### Americas
- English (en), Spanish (es), Portuguese (pt), French (fr)

#### Europe
- English (en), Spanish (es), French (fr), German (de), Russian (ru), Italian (it), Dutch (nl), Polish (pl), Ukrainian (uk)

#### Middle East & North Africa
- Arabic (ar), French (fr), English (en)

#### Asia
- Chinese (zh), Japanese (ja), Vietnamese (vi), Korean (ko), Thai (th), Indonesian (id), Hindi (hi)

## Implementation

### Core Configuration

Located in `src/i18n/index.ts`:

```typescript
export const DEFAULT_LOCALE = 'en';
export const SUPPORTED_LOCALES = [
  'en', 'es', 'fr', 'de', 'zh', 'ja', 'vi',  // Original 7
  'pt', 'ar', 'ru', 'it', 'ko', 'nl', 'pl',  // Phase 1-2
  'tr', 'th', 'id', 'hi', 'uk'               // Phase 3
] as const;
```

### Directory Structure

```typescript
src/
├── locales/
│   ├── en/
│   │   ├── common.json       # UI labels, buttons, navigation
│   │   ├── settings.json     # Settings screen translations
│   │   ├── auth.json         # Authentication flow
│   │   ├── profile.json      # User profile
│   │   ├── organization.json # Organization-related translations
│   │   └── pricing.json      # Pricing and subscriptions
│   ├── ar/  # Arabic (RTL)
│   ├── pt/  # Portuguese
│   ├── ru/  # Russian
│   └── ... (17 more language directories)
└── i18n/
    └── index.ts              # i18n configuration
```

### Translation Namespaces

We use **6 namespaces** to organize translations:

1. **common** - General UI elements, navigation, buttons
2. **settings** - Settings page, preferences, configurations
3. **auth** - Login, registration, password reset
4. **profile** - User profile, account management
5. **pricing** - Plans, subscriptions, billing
6. **organization** - Organization management, team settings

### Usage in Components

```typescript
import { useTranslation } from '@/i18n/hooks';

function MyComponent() {
  const { t } = useTranslation('common'); // Specify namespace
  
  return (
    <div>
      <h1>{t('welcome')}</h1>
      <p>{t('description')}</p>
    </div>
  );
}
```

### Switching Languages

```typescript
import { setLocale } from '@/i18n';

// Switch to a different language
await setLocale('ar'); // Arabic
await setLocale('es'); // Spanish
await setLocale('zh'); // Chinese
```

The `setLocale` function:
- Updates the current language
- Loads translation resources dynamically
- Persists selection to localStorage
- Updates HTML `lang` attribute
- Sets text direction for RTL languages

## Right-to-Left (RTL) Support

### RTL Languages

Currently supported RTL language:
- **Arabic (ar)** - Fully supported with automatic layout flipping

### RTL Detection

```typescript
import { isRTLLocale } from '@/i18n';

isRTLLocale('ar'); // true
isRTLLocale('en'); // false
```

### Automatic Layout Adjustment

When an RTL language is selected:

1. **HTML Attributes**
   - `<html dir="rtl" lang="ar">`
   - Automatically updated when language changes

2. **CSS Behavior**
   - Text alignment flips (left ↔ right)
   - Margins and padding flip automatically
   - List markers appear on the right
   - Blockquotes border on the right
   - Input icons position on the right

3. **UI Components**
   - Chat messages align to the right for user
   - Navigation elements mirror horizontally
   - Forms adjust input field alignment
   - Buttons and icons flip positions

### RTL CSS Implementation

Located in `src/index.css`:

```css
/* Automatic margin flipping */
[dir="rtl"] .ml-auto {
  margin-left: unset;
  margin-right: auto;
}

/* Text alignment */
[dir="rtl"] .text-left {
  text-align: right;
}

/* List markers */
[dir="rtl"] .chat-markdown ul,
[dir="rtl"] .chat-markdown ol {
  margin-left: 0;
  margin-right: 1.25rem;
}

/* Blockquotes */
[dir="rtl"] .chat-markdown blockquote {
  padding-left: 0;
  padding-right: 1rem;
  border-left: none;
  border-right: 4px solid;
}
```

### Testing RTL

Comprehensive test suite in `src/__tests__/RTLSupport.test.tsx`:

```bash
npm test -- RTLSupport.test.tsx
```

**26 tests covering:**
- RTL locale detection
- HTML attribute management
- CSS selector behavior
- Locale persistence
- Language switching
- Edge cases
- Accessibility
- Performance
- Integration scenarios

## Country-to-Language Mapping

Located in `src/utils/mockUserData.ts`:

```typescript
export const countryToLanguageMap: Record<string, Language> = {
  // Portuguese
  BR: 'pt', PT: 'pt', AO: 'pt', MZ: 'pt',
  
  // Arabic (18 countries)
  SA: 'ar', AE: 'ar', EG: 'ar', IQ: 'ar', JO: 'ar',
  
  // Russian (8 countries)
  RU: 'ru', BY: 'ru', KZ: 'ru',
  
  // And more...
};
```

**Total Coverage:** 50+ countries mapped to appropriate languages

## Best Practices

### 1. Always Use Translation Keys

```typescript
// ✅ Good
<button>{t('common:save')}</button>

// ❌ Bad
<button>Save</button>
```

### 2. Namespace Your Translations

```typescript
// ✅ Good - Explicit namespace
const { t } = useTranslation('settings');

// ⚠️ Acceptable - Uses default namespace
const { t } = useTranslation(); // Uses 'common' by default
```

### 3. Handle Pluralization

```json
{
  "items": "{{count}} item",
  "items_other": "{{count}} items"
}
```

```typescript
t('items', { count: 1 });  // "1 item"
t('items', { count: 5 });  // "5 items"
```

### 4. Use Interpolation

```json
{
  "greeting": "Hello, {{name}}!"
}
```

```typescript
t('greeting', { name: 'Alice' }); // "Hello, Alice!"
```

### 5. Test in Multiple Languages

```typescript
describe('Component', () => {
  it('should render in all supported languages', async () => {
    for (const lang of SUPPORTED_LOCALES) {
      await setLocale(lang);
      render(<MyComponent />);
      // Assertions...
    }
  });
});
```

## Adding a New Language

### Step 1: Create Locale Directory

```bash
mkdir src/locales/[language_code]
```

### Step 2: Copy English Templates

```bash
cp src/locales/en/*.json src/locales/[language_code]/
```

### Step 3: Translate All Files

Translate all 6 namespace files:
- `common.json`
- `settings.json`
- `auth.json`
- `profile.json`
- `pricing.json`
- `organization.json`

### Step 4: Update Configuration

Add language code to `SUPPORTED_LOCALES` in `src/i18n/index.ts`:

```typescript
export const SUPPORTED_LOCALES = [
  'en', 'es', 'fr', /* ... */, 'new_lang'
] as const;
```

### Step 5: Add Language Label

Add language name in all locale `common.json` files:

```json
{
  "languages": {
    "new_lang": "New Language Name"
  }
}
```

### Step 6: Update Country Mapping (if applicable)

Add country codes in `src/utils/mockUserData.ts`:

```typescript
export const countryToLanguageMap: Record<string, Language> = {
  XX: 'new_lang',  // Country code
  // ...
};
```

### Step 7: Add to Tests

Update test arrays in:
- `src/__tests__/PricingI18n.test.tsx`
- Any other i18n-related tests

### Step 8: If RTL Language

Add to RTL configuration in `src/i18n/index.ts`:

```typescript
export const RTL_LOCALES: ReadonlySet<AppLocale> = 
  new Set(['ar', 'new_rtl_lang'] as const);
```

## Translation Guidelines

### 1. **Consistency**
- Use consistent terminology across all namespaces
- Maintain the same tone and style
- Keep button labels concise

### 2. **Context**
- Provide context for translators
- Explain technical terms
- Note UI constraints (character limits)

### 3. **Cultural Adaptation**
- Adapt idioms and expressions
- Consider cultural sensitivities
- Use appropriate formality levels

### 4. **Technical Terms**
- Keep brand names untranslated
- Maintain consistent technical vocabulary
- Preserve placeholder syntax: `{{variable}}`

### 5. **Quality Assurance**
- Native speaker review
- Context testing in the UI
- Proofread for grammar and spelling

## Performance Optimization

### Lazy Loading

Languages are loaded on-demand:

```typescript
// Only loads resources when needed
await setLocale('fr');
```

### Caching

- Loaded translations are cached in memory
- localStorage persists language selection
- No redundant network requests

### Bundle Size

- English (default): Bundled with app (~8KB)
- Other languages: Loaded dynamically (~6-8KB each)
- Total overhead: Minimal (<1MB for all languages)

## Accessibility

### Screen Readers

- `lang` attribute set on `<html>` element
- Proper language switching announced
- RTL direction communicated

### Keyboard Navigation

- Works seamlessly in all languages
- RTL navigation respects text direction
- Focus management preserved

### WCAG Compliance

- Language identification (WCAG 3.1.1)
- Language of parts (WCAG 3.1.2)
- Text direction properly marked

## Troubleshooting

### Missing Translations

If a translation key is missing:
1. Falls back to English
2. Shows key name in development
3. Logs warning to console

### RTL Layout Issues

If RTL layout doesn't work:
1. Check HTML `dir` attribute is set
2. Verify CSS rules are loaded
3. Clear browser cache
4. Test in incognito mode

### Language Not Switching

Common causes:
1. Typo in language code
2. Resources not loaded
3. localStorage access blocked
4. Browser compatibility issue

Debug with:
```typescript
import { i18n } from '@/i18n';

console.log('Current language:', i18n.language);
console.log('Loaded namespaces:', i18n.store.data);
```

## Future Enhancements

### Planned RTL Languages
- Hebrew (he)
- Persian/Farsi (fa)
- Urdu (ur)

### Planned LTR Languages
- Bengali (bn)
- Malay (ms)
- Swahili (sw)
- Tagalog (tl)

### Features in Development
- Automatic language detection from browser
- Region-specific variants (pt-BR vs pt-PT)
- Translation management system
- Crowdsourced translation contributions

## Resources

### Internal Documentation
<!-- TODO: Create these documentation files -->
<!-- - [Translation File Structure](./TRANSLATION_STRUCTURE.md) -->
<!-- - [RTL Development Guide](./RTL_GUIDE.md) -->
<!-- - [Testing i18n](./TESTING_I18N.md) -->

### External Resources
- [i18next Documentation](https://www.i18next.com/)
- [React i18next](https://react.i18next.com/)
- [Unicode Bidirectional Text](https://unicode.org/reports/tr9/)
- [W3C i18n Guidelines](https://www.w3.org/International/)

## Support

For questions or issues:
- Create an issue on GitHub
- Contact the development team
- Check existing documentation

---

**Last Updated:** 2025-01-13  
**Version:** 2.0.0  
**Maintained by:** Blawby Development Team
