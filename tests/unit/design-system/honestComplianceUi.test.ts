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
});
