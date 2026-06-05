import type { ComponentChildren } from 'preact';
import { Fragment } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface LetterPaperProps {
  /** Letterhead — firm name (serif) on the left. Use <em> for the lawyer's name. */
  firm?: ComponentChildren;
  /** Letterhead — address block (mono, dim) on the right. */
  address?: ComponentChildren;
  /** Optional date line beneath the letterhead. */
  date?: string;
  /** The H1 document title (e.g. "Engagement letter"). */
  title?: string;
  /** Body content — use <p>, <h2>, <LetterPaper.Placeholder>, <LetterPaper.Fee>. */
  children: ComponentChildren;
  className?: string;
}

export interface LetterPaperPlaceholderProps {
  /** When true, renders the resolved (green) variant instead of unresolved gold. */
  resolved?: boolean;
  children: ComponentChildren;
  className?: string;
}

export interface LetterPaperFeeRow {
  label: ComponentChildren;
  amount: ComponentChildren;
}

export interface LetterPaperFeeProps {
  /** Mono uppercase head — e.g. "Fee summary". */
  head?: string;
  rows: readonly LetterPaperFeeRow[];
  /** Optional total row rendered with a top hairline + 22px serif amount. */
  total?: LetterPaperFeeRow;
  className?: string;
}

/**
 * Letter paper (DESIGN_SYSTEM §3.9).
 *
 * Print-safe document shell for engagement letters and invoices. **Uses
 * fixed hex values for color (not theme tokens)** — the document should
 * look identical regardless of app theme. @media print drops the
 * surrounding shadow and border.
 */
export function LetterPaper({
  firm,
  address,
  date,
  title,
  children,
  className
}: LetterPaperProps) {
  return (
    <article className={cn('letter-paper', className)}>
      {(firm || address) && (
        <header className="letter-paper-head">
          {firm && <div className="letter-paper-firm">{firm}</div>}
          {address && <div className="letter-paper-addr">{address}</div>}
        </header>
      )}
      {title && <h1>{title}</h1>}
      {date && <div className="letter-paper-date">{date}</div>}
      {children}
    </article>
  );
}

function LetterPaperPlaceholder({ resolved, children, className }: LetterPaperPlaceholderProps) {
  return (
    <span
      className={cn(
        'letter-paper-placeholder',
        resolved && 'letter-paper-placeholder-resolved',
        className
      )}
    >
      {children}
    </span>
  );
}

function LetterPaperFee({ head, rows, total, className }: LetterPaperFeeProps) {
  return (
    <section className={cn('letter-paper-fee', className)}>
      {head && <div className="letter-paper-fee-head">{head}</div>}
      <dl>
        {rows.map((row, idx) => (
          <Fragment key={idx}>
            <dt>{row.label}</dt>
            <dd>{row.amount}</dd>
          </Fragment>
        ))}
      </dl>
      {total && (
        <div className="letter-paper-fee-total">
          <span>{total.label}</span>
          <b>{total.amount}</b>
        </div>
      )}
    </section>
  );
}

LetterPaper.Placeholder = LetterPaperPlaceholder;
LetterPaper.Fee = LetterPaperFee;
