Foundation

Adopt i18next + react-i18next (works with preact/compat) and add supporting deps (i18next-browser-languagedetector, i18next-http-backend, @types/i18next) in package.json:1; wire npm script lint:i18n for JSON validation and missing-key checks.
Create locale asset tree (src/locales/en/common.json, etc.) and loader modules (src/i18n/index.ts:1, src/i18n/detectLocale.ts:1); enable code-splitting via import(/* @vite-ignore */ ...) so Vite bundles per-locale chunks.
Update bundler/tooling: add JSON locale alias in tsconfig.json:1, include .json glob in vitest.config.ts:1 resolve aliases, extend vite.config.ts:1 to pre-bundle i18next, mark locale chunk manual splitting, expose env var for available languages.
Wrap the app root with the provider (src/index.tsx:1) and supply suspense fallback for lazy-loaded namespaces; ensure SSR/prerender path hydrates with default en and rehydrates once detection finishes.
Surface locale preference from settings: persist selection in storage (existing language field) and thread through a new LocaleContext or extend settings store so useSettingsData.ts:1, useNavigation consumers, and PWA manifest updates stay in sync.
Frontend Scope

App shell & layout (src/components/AppLayout.tsx:1, src/components/LeftSidebar.tsx:1, src/components/MobileTopNav.tsx:1, src/components/BottomNavigation.tsx:1, src/components/MobileTopNav.tsx:1) need copy extraction, aria-label translation, and locale-aware badge formatting.
Chat experience (src/components/ChatContainer.tsx:1, src/components/Message.tsx:1, src/components/MessageComposer.tsx:1, src/components/VirtualMessageList.tsx:1, src/components/AIThinkingIndicator.tsx:1, src/components/PrivacySupportSidebar.tsx:1, src/components/ContactForm.tsx:1) must replace system messages, placeholders, toasts, and disclaimers with t() keys; ensure markdown-rendered AI copy uses translated fallbacks.
Modals & overlays (src/components/Modal.tsx:1, src/components/ContactOptionsModal.tsx:1, src/components/CameraModal.tsx:1, src/components/PricingModal.tsx:1, src/components/PaymentEmbed.tsx:1, src/components/DragDropOverlay.tsx:1) require key extraction plus locale-sensitive currency formatting; rework the hardcoded country list by sourcing ISO data + translations.
Settings suite (src/components/settings/SettingsLayout.tsx:1, src/components/settings/SettingsPage.tsx:1, src/components/settings/SettingsItem.tsx:1, src/components/settings/components/*.tsx, src/components/settings/pages/*.tsx) covers navigation labels, toggles, help content, and descriptive copy—migrate to namespace like settings.
Auth & onboarding (src/components/AuthPage.tsx:1, src/components/UserProfile.tsx:1, src/components/OrganizationProfile.tsx:1, src/components/OrganizationNotFound.tsx:1) include status messages, validation errors, and CTA text; ensure success/error toasts use translator-aware helpers.
Marketing & pricing widgets (src/components/PricingComparison.tsx:1, src/components/FeatureComparisonTable.tsx:1, src/components/PaymentContent.tsx:1, src/components/DocumentChecklist.tsx:1, src/components/ActivityTimeline.tsx:1, src/components/MatterProgress.tsx:1, src/components/MatterTab.tsx:1) require translation keys and dynamic pluralization.
Utilities & State

Hooks (src/hooks/useMessageHandling.ts:1, src/hooks/useChatScroll.ts:1, src/hooks/useFileUpload.ts:1) expose hardcoded status strings, warnings, and console diagnostics—route through i18n, preserving English logs behind dev guard.
Form helpers (src/utils/forms.ts:1, src/utils/conversationalForm.ts:1) contain conversational messages sent back to users; convert to key-based templates, add interpolation safeguards.
Mock data/services (src/utils/mockUserData.ts:1, src/utils/mockPricingData.ts:1) should serve locale-aware metadata (plan names, feature blurbs, languages); consider splitting static copy into locale JSON rather than TS constants.
Navigation & settings helpers (src/components/settings/hooks/useSettingsData.ts:1, src/components/settings/hooks/useSettingsNavigation.ts:1, src/utils/navigation.ts if present) should expose locale setter, translate error strings, and adjust type definitions to include availableLocales.
Worker & Backend

API responses and middleware (worker/index.ts:1, worker/utils/responseUtils.ts:1, worker/middleware/*.ts, worker/routes/*.ts, worker/services/*.ts) return user-visible error messages; decide whether to localize or return codes consumed by the frontend translator.
Legal intake prompts (worker/agents/legal-intake/promptTemplates.ts:1, worker/agents/legal-intake/index.ts:1, worker/agents/legal-intake/errors.ts:1) embed English guidance that shapes AI output; scope a follow-up initiative to internationalize prompt text or provide per-locale variants.
Email/PDF generators (worker/services/PDFGenerationService.ts:1, worker/lib/pdf.ts:1, worker/services/EmailService.ts:1) should load translated templates, with locale chosen via request metadata.
Docs, Build, Tests

Update onboarding docs (README.md:1, quickstart.sh:1, NOTIFICATION_IMPLEMENTATION_PLAN.md:1, intake_form_chatbot_plan.md:1) to explain locale management, translation workflow, and required env vars (e.g., DEFAULT_LOCALE, SUPPORTED_LOCALES).
Add developer guide (docs/i18n.md:1) covering key naming, namespace structure, JSON linting, and translation review checklist; reference it from CONTRIBUTING.md:1.
Extend tests: create unit coverage for provider + hooks (src/__tests__/i18nProvider.test.ts:1 new), update existing tests relying on hardcoded English (tests/integration/api/*.test.ts, tests/unit/**/*.test.ts) to assert translation keys or localized messages; add snapshot handling for multiple locales.
Ensure Playwright/e2e flows select multiple languages; adjust test-conversation-flow.sh:1 to set locale in API calls so assertions don’t break.
Internationalize metadata: edit index.html:1, public/manifest.webmanifest (if added), SEOHead.tsx:1 to emit <html lang> and translated meta tags; consider alternate-language sitemap entries in public/sitemap.xml:1.
Risks & Follow-Ups

Translation volume is large (~60 TSX files + worker prompts); prioritize UI/UX copy first, then conversational responses, then backend surfaces.
AI prompt localization may change model behavior; validate outputs per language with staged rollout.
Country lists and pricing data need canonical data sources to avoid duplicating translations.
Coordinate with translation provider before merging to keep JSON keys synchronized.
Next steps:

Stand up i18n foundation branch implementing provider, locale assets, and migrate the settings shell plus a sample flow (pricing or chat) end-to-end.
File follow-up tickets for: remaining component migrations, worker/API localization strategy, AI prompt translations, translation CI tooling, and external localization workflow integration.