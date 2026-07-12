/**
 * Explicit exceptions for issue #725. A file may retain inline styles only
 * when its values are computed at runtime or belong to a renderer that cannot
 * express them as a static design-system class.
 */
export const INLINE_STYLE_EXCEPTION_FILES = {
  themePreview: [
    'src/features/settings/pages/GeneralPage.tsx',
    'src/pages/DebugDialogsPage.tsx',
  ],
  documentRendering: [
    'src/features/engagements/pages/ClientEngagementReviewPage.tsx',
    'src/features/invoices/components/InvoicePreview.tsx',
  ],
  runtimeGeometryAndVirtualization: [
    'src/design-system/patterns/JourneyProgress.tsx',
    'src/design-system/primitives/Bar.tsx',
    'src/features/chat/components/ChatContainer.tsx',
    'src/features/chat/components/VirtualMessageList.tsx',
    'src/features/chat/views/ConversationListView.tsx',
    'src/features/matters/components/MatterSummaryCards.tsx',
    'src/features/matters/components/time-entries/TimeEntriesPanel.tsx',
    'src/features/settings/pages/PracticeTeamPage.tsx',
    'src/shared/ui/feedback/Alert.tsx',
    'src/shared/ui/input/LogoUploadInput.tsx',
    'src/shared/ui/input/PhoneInput.tsx',
    'src/shared/ui/input/Slider.tsx',
    'src/shared/ui/layout/AppShell.tsx',
    'src/shared/ui/list/EntityList.tsx',
    'src/shared/ui/media/Image.tsx',
    'src/shared/ui/ProgressRing.tsx',
    'src/shared/ui/upload/molecules/FileCard.tsx',
    'src/shared/ui/upload/molecules/UploadQueueRow.tsx',
  ],
  platformPositioningAndLayers: [
    'src/design-system/layout/FocusDrawer.tsx',
    'src/features/media/components/FileMenu.tsx',
    'src/shared/components/ToastContainer.tsx',
    'src/shared/ui/dialog/Dialog.tsx',
    'src/shared/ui/dialog/Fullscreen.tsx',
    'src/shared/ui/DragDropOverlay.tsx',
    'src/shared/ui/dropdown/DropdownMenuContent.tsx',
    'src/shared/ui/nav/OrgSwitcherMenu.tsx',
    'src/shared/ui/nav/Sidebar.tsx',
    'src/shared/ui/nav/SidebarProfileMenu.tsx',
    'src/shared/ui/overlays/ContextMenu.tsx',
  ],
  primitiveEscapeHatch: [
    'src/shared/ui/Button.tsx',
  ],
} as const;

/** Serif is reserved for public editorial intake and legal-document surfaces. */
export const SERIF_EXCEPTION_FILES = {
  publicIntake: [
    'src/features/intake/components/IntakeAcceptancePreview.tsx',
    'src/features/intake/components/IntakeFirmBar.tsx',
    'src/features/intake/components/IntakePaymentCard.tsx',
    'src/features/intake/components/IntakePaymentSummary.tsx',
    'src/features/intake/components/IntakePreflightChecks.tsx',
    'src/features/intake/components/IntakeScorecard.tsx',
    'src/features/intake/components/IntakeStickyHeader.tsx',
  ],
  legalEngagement: [
    'src/features/engagements/components/ClientEngagementAcknowledgmentsCard.tsx',
    'src/features/engagements/components/ClientEngagementDecideRow.tsx',
    'src/features/engagements/components/ClientEngagementGreetingBand.tsx',
    'src/features/engagements/components/ClientEngagementSignatureCard.tsx',
    'src/features/engagements/pages/ClientEngagementReviewPage.tsx',
  ],
  exportedDocumentStylesheet: [
    'src/index.css',
  ],
} as const;

export const flattenExceptionFiles = (
  groups: Readonly<Record<string, readonly string[]>>,
): string[] => Object.values(groups).flat().sort();
