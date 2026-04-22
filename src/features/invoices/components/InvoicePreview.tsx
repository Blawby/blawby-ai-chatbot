import { useState } from 'preact/hooks';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import { getMajorAmountValue } from '@/shared/utils/money';
import type { InvoiceLineItem } from '@/features/matters/types/billing.types';
import { normalizePublicFileUrl } from '@/shared/lib/apiClient';
import { sanitizeUserImageUrl } from '@/shared/utils/urlValidation';

type InvoicePreviewProps = {
  title: string;
  referenceLabel?: string | null;
  lineItems: InvoiceLineItem[];
  issueDate?: string | Date | null;
  dueDate?: string;
  invoiceNumber?: string | null;
  practiceName?: string | null;
  practiceLogoUrl?: string | null;
  practiceEmail?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  billingIncrementMinutes?: number | null;
  /** Notes to client shown below the amount hero */
  notes?: string | null;
};

const LogoAvatar = ({ src, name }: { src: string | null; name: string }) => {
  const [error, setError] = useState(false);

  const initials = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      style={{
        width: 56,
        height: 56,
        borderRadius: '50%',
        background: '#1a1a2e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {src && !error ? (
        <img
          src={src}
          alt={name}
          onError={() => setError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span style={{ fontSize: 18, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
          {initials}
        </span>
      )}
    </div>
  );
};

const MetaRow = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: 'flex', gap: '1rem', fontSize: 13, lineHeight: '1.6' }}>
    <span style={{ color: '#6b7280', minWidth: 100 }}>{label}</span>
    <span style={{ color: '#111827', fontWeight: 500 }}>{value}</span>
  </div>
);

const HR = () => (
  <div style={{ borderTop: '1px solid #e5e7eb', margin: '1.25rem 0' }} />
);

export const InvoicePreview = ({
  title,
  referenceLabel,
  lineItems,
  issueDate,
  dueDate,
  invoiceNumber,
  practiceName,
  practiceLogoUrl,
  practiceEmail,
  clientName,
  clientEmail,
  billingIncrementMinutes,
  notes,
}: InvoicePreviewProps) => {
  const subtotal = lineItems.reduce(
    (sum, item) => sum + getMajorAmountValue(item.line_total),
    0
  );

  const resolvedIssueDate =
    issueDate instanceof Date
      ? `${issueDate.getUTCFullYear()}-${String(issueDate.getUTCMonth() + 1).padStart(2, '0')}-${String(issueDate.getUTCDate()).padStart(2, '0')}`
      : issueDate;

  const totalFormatted = formatCurrency(subtotal);
  const dueDateFormatted = dueDate ? formatLongDate(dueDate) : null;
  const issueDateFormatted = resolvedIssueDate ? formatLongDate(resolvedIssueDate) : null;

  const rawLogoUrl = practiceLogoUrl ? normalizePublicFileUrl(practiceLogoUrl) : null;
  const logoUrl = rawLogoUrl ? sanitizeUserImageUrl(rawLogoUrl) : null;

  const hasBillingBlock = Boolean(practiceName || clientName || practiceEmail || clientEmail);

  const root: preact.JSX.CSSProperties = {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    background: '#ffffff',
    color: '#111827',
    fontSize: 13,
    lineHeight: '1.5',
  };

  return (
      <div className="w-full h-full flex items-start justify-center">
        {/* Render centered "paper" inside the preview panel. The panel keeps its
            background; the invoice itself is presented as a white sheet centered
            with a subtle shadow and spacing to emulate Stripe's preview look. */}
        <div className="w-full max-w-[760px] bg-white shadow-md" style={{ ...root }}>
        <div className="relative flex h-full flex-col overflow-hidden">
          {/* ── Scrollable body ── */}
          <div className="flex-1 overflow-y-auto" style={{ padding: '2rem 2rem 3rem' }}>

          {/* ── Header: "Invoice" title + logo ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
              Invoice
            </h1>
            {(logoUrl || practiceName) && (
              <LogoAvatar src={logoUrl} name={practiceName ?? 'Firm'} />
            )}
          </div>

          {/* ── Invoice meta (number, dates) ── */}
          <div style={{ marginBottom: '0.25rem' }}>
            {invoiceNumber && <MetaRow label="Invoice number" value={invoiceNumber} />}
            <MetaRow label="Date of issue" value={issueDateFormatted ?? '—'} />
            {dueDateFormatted && <MetaRow label="Date due" value={dueDateFormatted} />}
          </div>

          <HR />

          {/* ── From / Bill to ── */}
          {hasBillingBlock && (
            <>
              <div style={{ display: 'flex', gap: '3rem', marginBottom: '0.25rem' }}>
                {(practiceName || practiceEmail) && (
                  <div style={{ flex: 1 }}>
                    {practiceName && (
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>
                        {practiceName}
                      </p>
                    )}
                    {practiceEmail && (
                      <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
                        {practiceEmail}
                      </p>
                    )}
                  </div>
                )}
                {(clientName || clientEmail) && (
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>
                      Bill to
                    </p>
                    {clientName && (
                      <p style={{ fontSize: 13, color: '#111827', margin: '0 0 2px' }}>
                        {clientName}
                      </p>
                    )}
                    {clientEmail && (
                      <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
                        {clientEmail}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <HR />
            </>
          )}

          {/* ── Amount hero ── */}
          <div style={{ marginBottom: '1.5rem' }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
              {totalFormatted} USD{dueDateFormatted ? ` due ${dueDateFormatted}` : ''}
            </p>
            {(title || referenceLabel) && (
              <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px' }}>
                {[title, referenceLabel].filter(Boolean).join(' · ')}
              </p>
            )}
            {/* Pay online — visual only until invoice is sent */}
            <span
              className="text-accent-500"
              style={{ fontSize: 13, cursor: 'default', display: 'inline-block', marginBottom: notes ? '0.75rem' : 0 }}
            >
              Pay online
            </span>
            {notes && (
              <p style={{ fontSize: 13, color: '#374151', margin: '0.5rem 0 0', whiteSpace: 'pre-wrap' }}>
                {notes}
              </p>
            )}
          </div>

          {/* ── Line items ── */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem 0.5rem 0', fontSize: 12, fontWeight: 500, color: '#6b7280' }}>
                  Description
                </th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', fontSize: 12, fontWeight: 500, color: '#6b7280', width: 48 }}>
                  Qty
                </th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', fontSize: 12, fontWeight: 500, color: '#6b7280', width: 88 }}>
                  Unit price
                </th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0 0.5rem 0.75rem', fontSize: 12, fontWeight: 500, color: '#6b7280', width: 88 }}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {lineItems.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '1.25rem 0', fontSize: 13, color: '#9ca3af', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                    No line items added yet
                  </td>
                </tr>
              ) : (
                lineItems.map((item, index) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.6rem 0.75rem 0.6rem 0', fontSize: 13, color: '#111827', verticalAlign: 'top' }}>
                      {item.description || `Line item ${index + 1}`}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontSize: 13, color: '#111827', verticalAlign: 'top' }}>
                      {Number(item.quantity || 0).toFixed(
                        billingIncrementMinutes && billingIncrementMinutes > 0 ? 2 : 1
                      )}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontSize: 13, color: '#111827', verticalAlign: 'top' }}>
                      {formatCurrency(getMajorAmountValue(item.unit_price))}
                    </td>
                    <td style={{ padding: '0.6rem 0 0.6rem 0.75rem', textAlign: 'right', fontSize: 13, color: '#111827', verticalAlign: 'top' }}>
                      {formatCurrency(getMajorAmountValue(item.line_total))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* ── Totals block (right-aligned, Stripe style) ── */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <table style={{ borderCollapse: 'collapse', minWidth: 240 }}>
              <tbody>
                <tr>
                  <td style={{ padding: '0.35rem 1.5rem 0.35rem 0', fontSize: 13, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                    Subtotal
                  </td>
                  <td style={{ padding: '0.35rem 0', textAlign: 'right', fontSize: 13, color: '#111827', borderBottom: '1px solid #e5e7eb' }}>
                    {totalFormatted}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '0.35rem 1.5rem 0.35rem 0', fontSize: 13, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                    Total
                  </td>
                  <td style={{ padding: '0.35rem 0', textAlign: 'right', fontSize: 13, color: '#111827', borderBottom: '1px solid #e5e7eb' }}>
                    {totalFormatted}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '0.5rem 1.5rem 0 0', fontSize: 13, fontWeight: 700, color: '#111827' }}>
                    Amount due
                  </td>
                  <td style={{ padding: '0.5rem 0 0', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#111827' }}>
                    {totalFormatted} USD
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            borderTop: '1px solid #e5e7eb',
            padding: '0.6rem 2rem',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          <span style={{ fontSize: 11, color: '#6b7280' }}>
            {invoiceNumber ?? 'DRAFT'}
          </span>
          {dueDateFormatted && (
            <>
              <span style={{ fontSize: 11, color: '#d1d5db' }}>·</span>
              <span style={{ fontSize: 11, color: '#6b7280' }}>
                {totalFormatted} USD due {dueDateFormatted}
              </span>
            </>
          )}
        </div>
        </div>
      </div>
    </div>
  );
};
