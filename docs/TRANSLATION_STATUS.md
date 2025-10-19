# Translation Status

## Overview

This document tracks the translation status of all supported languages in the Blawby AI Chatbot. This reflects the current state of translations as of the latest update.

## Language Status Summary

| Language | Code | Template Status | Translation Status | RTL Support | Priority |
|----------|------|----------------|-------------------|-------------|----------|
| English | en | ✅ Complete | ✅ Complete | N/A | Baseline |
| Spanish | es | ✅ Complete | ⚠️ Partial | No | High |
| French | fr | ✅ Complete | ⚠️ Partial | No | High |
| German | de | ✅ Complete | ⚠️ Partial | No | High |
| Chinese | zh | ✅ Complete | ⚠️ Partial | No | High |
| Japanese | ja | ✅ Complete | ⚠️ Partial | No | High |
| Vietnamese | vi | ✅ Complete | ⚠️ Partial | No | High |
| **Portuguese** | pt | ✅ Complete | ✅ Complete | No | High |
| **Arabic** | ar | ✅ Complete | ✅ Complete | ✅ Yes | High |
| **Russian** | ru | ✅ Complete | ✅ Complete | No | High |
| **Italian** | it | ✅ Complete | ⚠️ Partial | No | Medium |
| **Korean** | ko | ✅ Complete | ⚠️ Partial | No | Medium |
| **Turkish** | tr | ✅ Complete | ⚠️ Partial | No | Medium |
| **Dutch** | nl | ✅ Complete | ⚠️ Partial | No | Medium |
| **Polish** | pl | ✅ Complete | ⚠️ Partial | No | Medium |
| **Thai** | th | ✅ Complete | ⚠️ Partial | No | Low |
| **Indonesian** | id | ✅ Complete | ✅ Complete | No | Low |
| **Hindi** | hi | ✅ Complete | ⚠️ Partial | No | Low |
| **Ukrainian** | uk | ✅ Complete | ⚠️ Partial | No | Low |

**Legend:**
- ✅ Complete: Fully translated and validated
- ⚠️ Partial: Partially translated, needs completion
- 🔄 Pending: Template ready, awaiting translation
- ❌ Missing: Not yet created

## Namespace Status

### Common Namespace (`common.json`)

**Status:** All 19 languages have template files created

**Known Missing Keys (Incomplete Languages):**
- `language.it`, `language.ko`, `language.nl`, `language.pl`, `language.tr`
- `language.th`, `language.hi`, `language.uk`

**Additional Missing Keys (de, fr, ja, vi, zh):**
- Complete `forms.*` section (labels, placeholders, descriptions, validation, accessibility, actions, examples)
- `forms.contactForm.*` keys
- `onboarding.step1.back`

### Settings Namespace (`settings.json`)

**Status:** All 19 languages have template files created

**Known Missing Keys (de, fr, ja, vi, zh):**
- `notifications.channels.none`

### Auth Namespace (`auth.json`)

**Status:** All 19 languages have template files created

**Known Missing Keys (de, es, fr, ja, vi, zh):**
- `errors.userNotFound`
- `errors.storageError`

### Profile Namespace (`profile.json`)

**Status:** All 19 languages have template files created  
**Issues:** None reported

### Pricing Namespace (`pricing.json`)

**Status:** All 19 languages have template files created  
**Issues:** None reported

## Translation Priority Plan

### Phase 1: High Priority (Immediate) - Original 7 Languages
Target: Complete existing translations

**Languages:** English (baseline), Spanish, French, German, Chinese, Japanese, Vietnamese

**Tasks:**
1. Add missing language labels for all 12 new languages
2. Complete forms.* section translations
3. Add missing auth error messages
4. Add missing settings keys
5. Validate all existing translations

**Estimated Effort:** 2-3 days

### Phase 2: High Priority (Week 1) - Phase 1 New Languages
Target: Portuguese, Arabic, Russian

**Languages:** Portuguese (pt), Arabic (ar), Russian (ru)

**Tasks:**
1. Professional translation of all 5 namespaces
2. Native speaker review
3. UI testing in each language
4. Special focus on Arabic RTL support

**Estimated Effort:** 1-2 weeks per language

### Phase 3: Medium Priority (Week 2-3) - Phase 2 New Languages
Target: Italian, Korean, Turkish, Dutch, Polish

**Languages:** Italian (it), Korean (ko), Turkish (tr), Dutch (nl), Polish (pl)

**Tasks:**
1. Professional translation of all 5 namespaces
2. Native speaker review
3. UI testing in each language

**Estimated Effort:** 1-2 weeks per language

### Phase 4: Low Priority (Month 1) - Phase 3 New Languages
Target: Thai, Indonesian, Hindi, Ukrainian

**Languages:** Thai (th), Indonesian (id), Hindi (hi), Ukrainian (uk)

**Tasks:**
1. Professional translation of all 5 namespaces
2. Native speaker review
3. UI testing in each language
4. Special testing for Thai and Hindi character rendering

**Estimated Effort:** 1-2 weeks per language

## Translation Workflow

### 1. Preparation
- [ ] Create translation briefs for each language
- [ ] Provide screenshots and UI context
- [ ] Document technical terms and brand voice
- [ ] Prepare glossary of terms

### 2. Translation
- [ ] Engage professional translators (native speakers)
- [ ] Provide translation memory/TM for consistency
- [ ] Use CAT (Computer-Assisted Translation) tools
- [ ] Maintain placeholder syntax: `{{variable}}`

### 3. Review
- [ ] Native speaker review for accuracy
- [ ] Cultural adaptation review
- [ ] Technical review for completeness
- [ ] QA check against lint tool

### 4. Testing
- [ ] UI integration testing
- [ ] Character rendering verification
- [ ] Text truncation/overflow check
- [ ] Accessibility testing
- [ ] RTL layout testing (Arabic only)

### 5. Validation
- [ ] Run `npm run lint:i18n`
- [ ] Run `npm run test:i18n`
- [ ] Manual UI walkthrough
- [ ] User acceptance testing

## Translation Guidelines

### General Rules

1. **Maintain Key Structure**
   - Do not modify JSON keys
   - Keep the nested structure intact
   - Preserve placeholder syntax: `{{variable}}`

2. **Character Limits**
   - Button labels: Max 20 characters
   - Menu items: Max 30 characters
   - Headings: Max 60 characters
   - Body text: No strict limit, but be concise

3. **Brand Terms**
   - "Blawby" - Keep as-is (brand name)
   - "AI" - Keep as "AI" or adapt to local tech terminology
   - "Chatbot" - Can be translated or kept as-is

4. **Technical Terms**
   - Consistent across all namespaces
   - Use established industry translations
   - Document any non-standard choices

5. **Tone & Style**
   - Professional but friendly
   - Clear and concise
   - Appropriate formality for legal context
   - Gender-neutral where possible

### Language-Specific Guidelines

#### Arabic (ar)
- **Direction**: RTL (Right-to-Left)
- **Numbers**: Use Western Arabic numerals (0-9)
- **Punctuation**: Mirror punctuation for RTL
- **Special Note**: Test all UI components in RTL mode

#### Chinese (zh)
- **Simplified**: Use Simplified Chinese characters
- **Honorifics**: Use appropriate level of formality
- **Special Note**: Consider Traditional Chinese variant in future

#### Japanese (ja)
- **Script**: Mix of Kanji, Hiragana, Katakana as appropriate
- **Honorifics**: Use appropriate keigo (polite language)
- **Special Note**: Consider mobile text wrapping

#### Thai (th)
- **Script**: Thai script with proper tone marks
- **Word Breaks**: Thai doesn't use spaces between words
- **Special Note**: Test character rendering carefully

#### Hindi (hi)
- **Script**: Devanagari script
- **Formality**: Use appropriate level of formality
- **Special Note**: Test character rendering and line height

## Current Lint Status

Last run: 2025-01-13

**Summary:**
- 19/19 languages have template files created
- 0/19 languages are 100% complete
- 1/19 languages are baseline (English)
- 6/19 languages have partial translations
- 12/19 languages pending translation

**Common Issues:**
- All non-English languages missing new language labels
- Original 7 languages (excluding English) missing some form fields
- Some languages missing auth error messages

## Resources for Translators

### Internal Resources
- [Internationalization Guide](./INTERNATIONALIZATION.md)
- English baseline: `src/locales/en/`
- Current locale files: `src/locales/[lang]/`

### Tools
- i18n Linter: `npm run lint:i18n`
- i18n Tests: `npm run test:i18n`
- JSON Formatter: Online JSON beautifiers

### External Resources
- [i18next Documentation](https://www.i18next.com/)
- [Mozilla L10n Guide](https://mozilla-l10n.github.io/localizer-documentation/)
- [Google Style Guides](https://developers.google.com/style)

## Contact

For translation questions or to volunteer:
- Create an issue on GitHub with `[Translation]` tag
- Email: [translations@blawby.com](mailto:translations@blawby.com)
- Include: Language, namespace, specific question/issue

## Change Log

### 2025-01-13
- ✅ Created template files for 12 new languages
- ✅ Added RTL support for Arabic
- ✅ Updated i18n configuration
- ✅ Added language labels to English baseline
- 🔄 Pending: Add language labels to all other locales
- 🔄 Pending: Complete forms section for original 7 languages
- 🔄 Pending: Translate all 12 new language files

### Previous
- ✅ Initial 7 languages partially translated
- ✅ Basic i18n infrastructure established
- ✅ Testing framework implemented

---

**Last Updated:** 2025-01-13  
**Version:** 2.0.0  
**Status:** Templates Ready - Translation In Progress
