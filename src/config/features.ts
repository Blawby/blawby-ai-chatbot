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
     * Enable in-composer camera capture ("Take Photo" menu item)
     * When false, the camera item is hidden from the file menu.
     */
    enableCameraCapture: boolean;

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
     * Enable account links settings UI
     * When false, the account links section is hidden
     */
    enableAccountLinks: boolean;

    /**
     * Enable practice calendar workspace
     * When false, calendar navigation and routes stay hidden
     */
    enableCalendar: boolean;

    /**
     * Enable multi-factor authentication settings UI and enrollment flow
     * When false, MFA controls and routes stay hidden from settings
     */
    enableMfa: boolean;
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
    /**
     * Enable message reactions feature
     * When false, reaction UI and functionality will be hidden from messages
     */
    enableMessageReactions: boolean;
}

// Immutable base configuration
const baseFeatureConfig: FeatureFlags = {
    enableAudioRecording: true, // Voice memo button shown inside the composer pill
    enableVideoRecording: false, // Not implemented yet
    enableFileAttachments: true, // Enabled for authenticated (client/practice) workspaces only
    enableCameraCapture: false, // Hide "Take Photo" menu item — not supported at this time
    enableMessageFeedback: false, // Disable feedback and copy buttons on messages
    enableDisclaimerText: false, // Disable disclaimer text below input
    enableLearnServicesButton: false, // Hide learn services button
    enableConsultationButton: false, // Hide consultation request button
    enableMobileBottomNav: false, // Temporarily hide mobile bottom nav
    enablePaymentIframe: false, // Disable payment iframe/drawer - only show "Open in Browser" button
    enableLeadQualification: true, // Enable lead qualification flow - AI asks questions before contact form
    enableMultiplePractices: true, // Enable multiple practices feature
    enableAccountLinks: false, // Hide account links until the settings flow is ready
    enableCalendar: false, // Hide calendar until the backend/data pipeline is ready end-to-end
    enableMfa: false, // Hide MFA until the backend/auth flow is ready end-to-end

    enablePlusTier: false, // Hide Plus plan by default (not available at launch)
    enableMessageReactions: false, // Disable message reactions for MVP
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
