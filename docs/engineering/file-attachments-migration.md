# File Attachments Migration Plan

## Overview
File attachments in chat are currently disabled pending backend upload migration. This document outlines the timeline, impact, and rollback procedures.

## Current Status
- Feature flag `enableFileAttachments` is set to `false` in `src/config/features.ts`
- UI correctly hides attachment controls when the flag is disabled
- Upload handlers in `WidgetApp.tsx` check the feature flag before proceeding

## Migration Timeline
- **Expected Re-enable Date**: TBD (pending backend upload infrastructure completion)
- **Backend Migration**: Implement secure file upload to R2 storage with proper validation and access controls
- **Frontend Updates**: Complete upload logic in `handleFileSelect` and `handleMediaCapture` handlers
- **Testing**: Comprehensive E2E and unit tests for upload functionality

## User Impact
- Users cannot currently attach files in chat conversations
- Existing attachments (if any) remain unaffected
- No data loss expected

## Support Plan
- Notify users via in-app messaging when feature is re-enabled
- Provide alternative file sharing methods (e.g., email attachments) during migration
- Monitor support tickets for file upload requests

## Rollback Contingency
If migration slips or issues arise:
1. Keep `enableFileAttachments` set to `false`
2. No additional changes needed - feature remains disabled
3. Re-enable procedure: Set flag to `true` and deploy after backend is ready
4. Temporary workaround: Direct users to external file sharing if urgent

## Stakeholder Alignment
- Product: Approved temporary disable for migration
- Support: Prepared with communication templates
- Engineering: Backend team owns migration completion