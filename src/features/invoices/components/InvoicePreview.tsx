import { useState } from 'preact/hooks';
/*
  Invoice preview uses LetterPaper (DESIGN_SYSTEM §3.9), a print-safe
  document shell that intentionally uses fixed hex values for color.
  The avatar fallback below uses inline fixed hex values for the same
  reason — the document must look identical regardless of app theme.
*/
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import { getMajorAmountValue } from '@/shared/utils/money';
import type { InvoiceLineItem } from '@/features/matters/types/billing.types';
import { normalizePublicFileUrl } from '@/shared/lib/apiClient';
import { sanitizeUserImageUrl } from '@/shared/utils/urlValidation';
import { LetterPaper, type LetterPaperFeeRow } from '@/design-system/patterns/LetterPaper';

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
  /** Notes to client shown below the line items */
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
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: '#f1f5f9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
        marginBottom: 10,
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
        <span style={{ fontSize: 16, fontWeight: 700, color: '#475569', letterSpacing: '-0.02em' }}>
          {initials}
        </span>
      )}
    </div>
  );
};

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

  const referenceLine = [title, referenceLabel].filter(Boolean).join(' · ');
  const qtyDigits = billingIncrementMinutes && billingIncrementMinutes > 0 ? 2 : 1;

  const firmNode = (logoUrl || practiceName) ? (
    <>
      {(logoUrl || practiceName) && (
        <LogoAvatar src={logoUrl} name={practiceName ?? 'Firm'} />
      )}
      {practiceName ? (
        practiceName
      ) : (
        <LetterPaper.Placeholder>firm name</LetterPaper.Placeholder>
      )}
    </>
  ) : null;

  const addressNode = practiceEmail ? practiceEmail : null;

  const feeRows: LetterPaperFeeRow[] = lineItems.length === 0
    ? [{ label: 'No line items added yet', amount: formatCurrency(0) }]
    : lineItems.map((item, index) => {
        const qty = Number(item.quantity || 0).toFixed(qtyDigits);
        const unit = formatCurrency(getMajorAmountValue(item.unit_price));
        const description = item.description || `Line item ${index + 1}`;
        return {
          label: `${description} — ${qty} × ${unit}`,
          amount: formatCurrency(getMajorAmountValue(item.line_total)),
        };
      });

  return (
    <div className="w-full h-full overflow-y-auto py-4">
      <LetterPaper
        firm={firmNode}
        address={addressNode}
        title="Invoice"
        date={issueDateFormatted ?? undefined}
      >
        {(invoiceNumber || dueDateFormatted) && (
          <p>
            {invoiceNumber ? (
              <>Invoice number <strong>{invoiceNumber}</strong></>
            ) : (
              <>Invoice number <LetterPaper.Placeholder>assigned on send</LetterPaper.Placeholder></>
            )}
            {dueDateFormatted && (
              <> · Due <strong>{dueDateFormatted}</strong></>
            )}
          </p>
        )}

        <h2>Billed to</h2>
        <p>
          {clientName ? (
            <LetterPaper.Placeholder resolved>{clientName}</LetterPaper.Placeholder>
          ) : (
            <LetterPaper.Placeholder>client name</LetterPaper.Placeholder>
          )}
          {clientEmail && (
            <>
              <br />
              {clientEmail}
            </>
          )}
        </p>

        {referenceLine && (
          <>
            <h2>Matter</h2>
            <p>{referenceLine}</p>
          </>
        )}

        <LetterPaper.Fee
          head="Services rendered"
          rows={feeRows}
          total={{ label: 'Total due', amount: `${totalFormatted} USD` }}
        />

        {notes && (
          <p style={{ whiteSpace: 'pre-wrap' }}>{notes}</p>
        )}
      </LetterPaper>
    </div>
  );
};
