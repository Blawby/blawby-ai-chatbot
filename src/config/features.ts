/**
 * Feature flags configuration
 * 
 * This file contains feature flags that can be toggled to enable/disable
 * specific features in the application without code changes.
 */

interface FeatureFlags {
    /**
     * Enable audio recording feature
     * When false, the audio recording button will be hidden from the UI
     */
    enableAudioRecording: boolean;

    /**
     * Enable video recording feature (future)
     * Not currently implemented in the UI
     */
    enableVideoRecording: boolean;

    /**
     * Enable file attachments
     * When false, file upload functionality will be hidden
     */
    enableFileAttachments: boolean;

    /**
     * Enable left sidebar
     * When false, the left column will be hidden and the layout will be 2-column
     */
    enableLeftSidebar: boolean;

    /**
     * Enable AI feedback and copy buttons on messages
     * When false, feedback UI and copy functionality will be hidden from messages
     */
    enableMessageFeedback: boolean;

    /**
     * Enable disclaimer text below input
     * When false, the disclaimer text will be hidden
     */
    enableDisclaimerText: boolean;

    /**
     * Enable "Learn about our services" button
     * When false, the learn services button will be hidden from welcome messages
     */
    enableLearnServicesButton: boolean;

    /**
     * Enable "Request a consultation" button
     * When false, the consultation request button will be hidden from welcome messages
     */
    enableConsultationButton: boolean;

    /**
     * Enable mobile bottom navigation bar
     * When false, the bottom nav is hidden on mobile
     */
    enableMobileBottomNav: boolean;

    /**
     * Enable payment iframe/drawer functionality
     * When false, only the "Open in Browser" button will be shown
     * When true, both "Pay" button (opens drawer) and "Open in Browser" button will be shown
     */
    enablePaymentIframe: boolean;

    /**
     * Enable lead qualification flow
     * When false, AI will show contact form immediately after getting legal issue info
     * When true, AI will ask qualifying questions before showing contact form
     */
    enableLeadQualification: boolean;

    /**
     * Enable multiple practices feature
     * When false, users can only have one practice
     * When true, users can create and manage multiple practices
     */
    enableMultiplePractices: boolean;

    /**
     * Enable paralegal agent feature
     * When false, paralegal agent functionality will be disabled
     * When true, paralegal agent features like matter progress tracking will be available
     */
    enableParalegalAgent: boolean;

    /**
     * Enable Plus subscription tier in UI
     * When false, the Plus plan is hidden from pricing/upgrade flows
     */
    enablePlusTier: boolean;

    /**
     * Enable Activity Timeline UI + /api/activity calls.
     *
     * Default: false
     *
     * NOTE: Activity is currently backed by the Worker + D1 and is not fully
     * migrated to staging-api. Keep this disabled until the remote API is the
     * source of truth for activity events.
     */
    enableActivity: boolean;
}

// Immutable base configuration
const baseFeatureConfig: FeatureFlags = {
    enableAudioRecording: false, // Set to false to hide voice recording
    enableVideoRecording: false, // Not implemented yet
    enableFileAttachments: true, // File attachments are enabled
    enableLeftSidebar: true, // Enable left sidebar
    enableMessageFeedback: false, // Disable feedback and copy buttons on messages
    enableDisclaimerText: false, // Disable disclaimer text below input
    enableLearnServicesButton: false, // Hide learn services button
    enableConsultationButton: false, // Hide consultation request button
    enableMobileBottomNav: false, // Temporarily hide mobile bottom nav
    enablePaymentIframe: false, // Disable payment iframe/drawer - only show "Open in Browser" button
    enableLeadQualification: true, // Enable lead qualification flow - AI asks questions before contact form
    enableMultiplePractices: true, // Enable multiple practices feature
    enableParalegalAgent: false, // Disable paralegal agent features by default
    enablePlusTier: false, // Hide Plus plan by default (not available at launch)
    enableActivity: false, // Disabled until activity is migrated off Worker/D1
};

// DEV-only overrides (computed via spread, no mutation)
const devOverrides: Partial<FeatureFlags> = import.meta.env.DEV ? {
    // Enable all features in development if needed
    // enableAudioRecording: true,
    // enablePlusTier: true,
} : {};

// Export frozen, readonly configuration
export const features: Readonly<FeatureFlags> = Object.freeze({
    ...baseFeatureConfig,
    ...devOverrides
}); 