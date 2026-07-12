import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('honest compliance UI', () => {
  it('does not render sample audit events as practice evidence', () => {
    const auditLog = source('src/features/settings/pages/AuditLogPage.tsx');
    expect(auditLog).not.toContain('DEMO_EVENTS');
    expect(auditLog).toContain('will not present sample entries as compliance evidence');
    expect(auditLog).toContain('Export unavailable');
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
    expect(authoring).toContain('AI template authoring is not connected');
  });

  it('does not claim unsupported exports, travel estimates, or intake side effects', () => {
    const exportsPage = source('src/features/settings/pages/ExportDataPage.tsx');
    const calendarDrawer = source('src/features/calendar/components/CalendarFocusDrawer.tsx');
    const intakeDetail = source('src/features/intake/pages/IntakeDetailPage.tsx');
    expect(exportsPage).not.toContain("showSuccess('Export requested'");
    expect(exportsPage).toContain('Export unavailable');
    expect(calendarDrawer).not.toContain("value: '~22 min'");
    expect(intakeDetail).not.toContain('Math.round((intake.amount * 4) / 3)');
    expect(intakeDetail).not.toContain('<IntakeAcceptancePreview');
    expect(intakeDetail).not.toContain('auto-transcribed');
  });
});
