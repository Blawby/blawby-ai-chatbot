import { FunctionComponent, type ComponentChildren } from 'preact';

import { DetailHeader } from '@/shared/ui/layout/DetailHeader';
import { cn } from '@/shared/utils/cn';
import { IntakeFilesPanel } from '@/features/intake/components/IntakeFilesPanel';

// ── Types ────────────────────────────────────────────────────────────────────

export type ClientIntakeStatusKind = 'submitted' | 'in_review' | 'scheduled' | 'declined';

export type ClientIntakeTimelineItem = {
  id: string;
  title: string;
  timestamp: string;
  state: 'complete' | 'current' | 'upcoming';
};

export type ClientIntakeResponse = {
  id: string;
  question: string;
  answer: string;
};

export type ClientIntakeStatus = {
  intakeUuid: string;
  templateName: string;
  submittedAt: string;
  status: ClientIntakeStatusKind;
  statusLabel: string;
  nextStep: string | null;
  timeline: ClientIntakeTimelineItem[];
  responses: ClientIntakeResponse[];
  notes: string | null;
};

type ClientIntakeStatusPageProps = {
  intake: ClientIntakeStatus | null;
  onBack?: () => void;
};

// ── Status pill ──────────────────────────────────────────────────────────────

const statusPillClass = (kind: ClientIntakeStatusKind): string => {
  switch (kind) {
    case 'scheduled':
      return 'bg-accent-success/15 text-accent-success ring-accent-success/30';
    case 'declined':
      return 'bg-accent-error/15 text-accent-error ring-accent-error/30';
    case 'in_review':
      return 'bg-accent-warning/15 text-accent-warning ring-accent-warning/30';
    case 'submitted':
    default:
      return 'bg-surface-utility/40 text-ink ring-line-subtle/30';
  }
};

// ── Sub-components ───────────────────────────────────────────────────────────

const Card: FunctionComponent<{ children: ComponentChildren; className?: string }> = ({
  children,
  className,
}) => (
  <section
    className={cn(
      'rounded-xl border border-card-border bg-surface-card p-4 sm:p-5',
      className,
    )}
  >
    {children}
  </section>
);

const SectionHeading: FunctionComponent<{ children: ComponentChildren }> = ({ children }) => (
  <h2 className="text-sm font-semibold text-ink">{children}</h2>
);

const TimelineRow: FunctionComponent<{ item: ClientIntakeTimelineItem; isLast: boolean }> = ({
  item,
  isLast,
}) => {
  const dotClass =
    item.state === 'complete'
      ? 'bg-accent-success'
      : item.state === 'current'
        ? 'bg-accent-warning'
        : 'bg-input-placeholder/60';
  const textClass = item.state === 'upcoming' ? 'text-dim-2' : 'text-ink';

  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className={cn('mt-1.5 h-2.5 w-2.5 rounded-full', dotClass)} aria-hidden="true" />
        {!isLast ? <span className="mt-1 h-full w-px flex-1 bg-card-border" aria-hidden="true" /> : null}
      </div>
      <div className="flex-1 pb-3">
        <p className={cn('text-sm font-medium', textClass)}>{item.title}</p>
        <p className="text-xs text-dim-2">{item.timestamp}</p>
      </div>
    </li>
  );
};

// ── Page ─────────────────────────────────────────────────────────────────────

export const ClientIntakeStatusPage: FunctionComponent<ClientIntakeStatusPageProps> = ({
  intake,
  onBack,
}) => {
  if (!intake) {
    return (
      <div className="flex h-full flex-col min-h-0 bg-surface-workspace">
        <DetailHeader title="Intake Forms" showBack={Boolean(onBack)} onBack={onBack} />
        <div className="p-6 text-sm text-dim-2">
          You have not submitted any intakes yet.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col min-h-0 bg-surface-workspace">
      <DetailHeader title="Intake Forms" showBack={Boolean(onBack)} onBack={onBack} />

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6">
          {/* Status card */}
          <Card>
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-base font-semibold text-ink">{intake.templateName}</h1>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
                  statusPillClass(intake.status),
                )}
              >
                {intake.statusLabel}
              </span>
            </div>
            <p className="mt-2 text-xs text-dim-2">Submitted {intake.submittedAt}</p>
          </Card>

          {/* Next step */}
          {intake.nextStep ? (
            <Card className="bg-surface-utility/30">
              <SectionHeading>Next Step</SectionHeading>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink/90">
                {intake.nextStep}
              </p>
            </Card>
          ) : null}

          {/* Timeline */}
          {intake.timeline.length > 0 ? (
            <Card>
              <SectionHeading>Timeline</SectionHeading>
              <ol className="mt-3 space-y-0">
                {intake.timeline.map((t, idx) => (
                  <TimelineRow key={t.id} item={t} isLast={idx === intake.timeline.length - 1} />
                ))}
              </ol>
            </Card>
          ) : null}

          {/* Your responses */}
          {intake.responses.length > 0 ? (
            <Card>
              <SectionHeading>Your Responses</SectionHeading>
              <dl className="mt-3 space-y-3">
                {intake.responses.map((r) => (
                  <div key={r.id} className="space-y-1">
                    <dt className="text-xs text-dim-2">{r.question}</dt>
                    <dd className="whitespace-pre-wrap text-sm text-ink">{r.answer}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : null}

          {/* Files — upload allowed only after the practice has accepted the
              intake (status flips to 'scheduled' for the client). Anonymous /
              still-in-review viewers see a read-only file list. See
              project_conversation_visibility memory. */}
          <IntakeFilesPanel
            intakeUuid={intake.intakeUuid}
            canUpload={intake.status === 'scheduled'}
            canDelete={false}
          />

          {/* Notes */}
          {intake.notes ? (
            <Card>
              <SectionHeading>Notes</SectionHeading>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink/90">
                {intake.notes}
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ClientIntakeStatusPage;
