import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('honest compliance UI', () => {
  it('does not render sample audit events as practice evidence', () => {
    const auditLog = source('src/features/settings/pages/AuditLogPage.tsx');
    const settingsContent = source('src/features/settings/pages/SettingsContent.tsx');
    expect(auditLog).not.toContain('DEMO_EVENTS');
    expect(auditLog).toContain('auditLogApi.list');
    expect(auditLog).toContain('auditLogApi.exportCsv');
    expect(settingsContent).not.toContain('Every action in your workspace is recorded');
  });

  it('does not infer assistant authorship from invoice age or line items', () => {
    const invoiceDetail = source('src/features/invoices/components/detail/PracticeInvoiceDetailView.tsx');
    expect(invoiceDetail).not.toContain('deriveIsStagedByAssistant');
    expect(invoiceDetail).not.toContain('Staged by assistant');
  });

  it('does not seed intake templates with fabricated AI suggestions or versions', () => {
    const templates = source('src/features/intake/pages/IntakeTemplatesPage.tsx');
    const authoring = source('src/features/intake/components/IntakeAuthoringStrip.tsx');
    expect(templates).not.toContain('DEMO_AI_SUGGESTIONS');
    expect(templates).not.toContain('DEMO_STAGED_QUESTIONS');
    expect(templates).not.toContain('v.{headerVersionNumber}');
    expect(authoring).not.toContain('Your instruction was saved');
    expect(authoring).toContain('Suggestions staged through the assistant appear here for review');
    expect(authoring).toContain('suggestion.analytics_evidence');
  });

  it('does not claim unsupported exports, travel estimates, or intake side effects', () => {
    const exportsPage = source('src/features/settings/pages/ExportDataPage.tsx');
    const calendarDrawer = source('src/features/calendar/components/CalendarFocusDrawer.tsx');
    const intakeDetail = source('src/features/intake/pages/IntakeDetailPage.tsx');
    expect(exportsPage).toContain('practiceExportsApi.request');
    expect(exportsPage).toContain('practiceExportsApi.get');
    expect(exportsPage).not.toContain('No export request is sent');
    expect(calendarDrawer).not.toContain("value: '~22 min'");
    expect(intakeDetail).not.toContain('Math.round((intake.amount * 4) / 3)');
    expect(intakeDetail).not.toContain('<IntakeAcceptancePreview');
    expect(intakeDetail).not.toContain('auto-transcribed');
  });

  it('does not persist pretend AI settings in the browser', () => {
    const intelligence = source('src/features/settings/pages/IntelligencePage.tsx');
    expect(intelligence).not.toContain('localStorage');
    expect(intelligence).not.toContain("showSuccess('System prompt saved'");
    expect(intelligence).not.toContain("showSuccess('Pause requested'");
    expect(intelligence).not.toContain('sonnet-4.5');
    expect(intelligence).not.toContain("{ key: 'matters', rows: 142 }");
    expect(intelligence).toContain('browser-only preferences that appear saved but do not affect the assistant');
  });

  it('does not answer arbitrary workspace questions with unrelated summaries', () => {
    const surfaces = [
      source('src/features/clients/pages/PracticeContactsPage.tsx'),
      source('src/features/matters/pages/PracticeMattersPage.tsx'),
      source('src/features/invoices/pages/PracticeInvoicesPage.tsx'),
      source('src/features/calendar/pages/PracticeCalendarPage.tsx'),
    ];

    for (const surface of surfaces) {
      expect(surface).toContain('<AIAskBar');
      expect(surface).toContain('disabled');
      expect(surface).toContain('Requires a grounded');
      expect(surface).not.toContain('Live natural-language');
    }
  });

  it('does not relabel navigation as AI work or invent intake service levels', () => {
    const matterOverview = source('src/features/matters/components/MatterOverviewTab.tsx');
    const intakeDetail = source('src/features/intake/pages/IntakeDetailPage.tsx');
    expect(matterOverview).not.toContain("label: 'Draft engagement update'");
    expect(matterOverview).not.toContain("label: 'Settlement projection'");
    expect(matterOverview).not.toContain('Staged · awaits your approval');
    expect(matterOverview).toContain("label: 'View engagement'");
    expect(intakeDetail).not.toContain("'< 3h response window'");
    expect(intakeDetail).not.toContain("'24h response window'");
    expect(intakeDetail).not.toContain('via ${practiceName');
  });

  it('uses real report and template capabilities without false success', () => {
    const reports = source('src/features/reports/pages/reports/AllReportsHub.tsx');
    const templates = source('src/features/settings/pages/EngagementTemplatesPage.tsx');
    expect(reports).not.toContain("showSuccess('Sent to your CPA'");
    expect(reports).not.toContain('Download PDF');
    expect(reports).toContain('Download CSV');
    expect(reports).toContain('Email CPA unavailable');
    expect(templates).not.toContain("showSuccess('Community templates'");
    expect(templates).toContain('await onDraftFromPrompt(');
    expect(templates).toContain('Community unavailable');
  });

  it('does not expose no-op engagement or trust controls and avoids proxy labels', () => {
    const workbench = source('src/features/engagements/components/EngagementWorkbench.tsx');
    const clientReview = source('src/features/engagements/pages/ClientEngagementReviewPage.tsx');
    const trust = source('src/features/trust/pages/PracticeTrustPage.tsx');
    const clients = source('src/features/clients/pages/PracticeContactsPage.tsx');
    expect(workbench).not.toContain("label: 'Polish'");
    expect(workbench).not.toContain("label: 'Translate'");
    expect(workbench).toContain('AI resolution unavailable');
    expect(workbench).toContain('PDF unavailable');
    expect(clientReview).toContain('Signed PDF unavailable');
    expect(trust).toContain('Pause draws unavailable');
    expect(clients).not.toContain('Awaiting docs');
    expect(clients).not.toContain('Awaiting reply');
    expect(clients).toContain('No activity 7d');
  });
});
