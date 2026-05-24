import { FunctionComponent } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { DetailHeader } from '@/shared/ui/layout/DetailHeader';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import { getIntakeStatus, type IntakeStatusResponse } from '../api/intakesApi';
import { queryCache } from '@/shared/lib/queryCache';
import { policyTtl } from '@/shared/lib/cachePolicy';
import {
  ClientIntakeStatusPage,
  type ClientIntakeStatus,
  type ClientIntakeStatusKind,
  type ClientIntakeTimelineItem,
} from './ClientIntakeStatusPage';

const safeDecode = (value: string | undefined | null): string | null => {
  if (typeof value !== 'string') return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const mapStatusKind = (raw: string): { kind: ClientIntakeStatusKind; label: string } => {
  const normalized = raw.toLowerCase();
  if (normalized.includes('schedule')) return { kind: 'scheduled', label: 'Consultation Scheduled' };
  if (normalized.includes('accept')) return { kind: 'scheduled', label: 'Intake Accepted' };
  if (normalized.includes('declin') || normalized.includes('reject')) return { kind: 'declined', label: 'Declined' };
  if (normalized.includes('review') || normalized.includes('pending')) return { kind: 'in_review', label: 'Pending Review' };
  return { kind: 'submitted', label: 'Submitted' };
};

const buildTimeline = (status: IntakeStatusResponse): ClientIntakeTimelineItem[] => {
  const submittedAt = formatLongDate(status.metadata?.created_at as string | undefined ?? '') ?? 'Submitted';
  const triageStatus = (status.metadata?.triage_status as string | undefined) ?? status.status ?? null;
  const scheduledAt = (status.metadata?.consultation_scheduled_at as string | undefined) ?? null;

  const items: ClientIntakeTimelineItem[] = [
    {
      id: 'submitted',
      title: 'Intake Submitted',
      timestamp: submittedAt,
      state: 'complete',
    },
  ];

  if (triageStatus === 'accepted' || scheduledAt) {
    items.push({
      id: 'accepted',
      title: 'Intake Accepted',
      timestamp: triageStatus === 'accepted' ? 'Accepted' : 'Pending',
      state: scheduledAt ? 'complete' : 'current',
    });
  }

  if (scheduledAt) {
    const scheduledLabel = formatLongDate(scheduledAt) ?? scheduledAt;
    items.push({
      id: 'scheduled',
      title: 'Consultation Scheduled',
      timestamp: scheduledLabel,
      state: 'current',
    });
  } else if (triageStatus === 'accepted') {
    items.push({
      id: 'awaiting',
      title: 'Awaiting consultation scheduling',
      timestamp: 'Upcoming',
      state: 'upcoming',
    });
  } else if (triageStatus === 'pending_review' || triageStatus === 'declined' || triageStatus === 'rejected') {
    items.push({
      id: 'status',
      title: triageStatus === 'pending_review' ? 'Pending review' : triageStatus === 'declined' ? 'Declined' : 'Rejected',
      timestamp: triageStatus === 'pending_review' ? 'Pending' : triageStatus === 'declined' ? 'Declined' : 'Rejected',
      state: 'current',
    });
  }

  return items;
};

const buildResponses = (status: IntakeStatusResponse) => {
  const out: Array<{ id: string; question: string; answer: string }> = [];
  if (status.description?.trim()) {
    out.push({ id: 'description', question: 'Brief description', answer: status.description.trim() });
  }
  if (status.opposing_party?.trim()) {
    out.push({ id: 'opposing-party', question: 'Opposing party', answer: status.opposing_party.trim() });
  }
  const meta = (status.metadata ?? {}) as Record<string, unknown>;
  const customFields = meta.customFields ?? meta.custom_fields;
  if (customFields && typeof customFields === 'object' && !Array.isArray(customFields)) {
    for (const [key, value] of Object.entries(customFields as Record<string, unknown>)) {
      if (key.startsWith('_') || value == null || value === '') continue;
      const answer = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
      const question = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      out.push({ id: key, question, answer });
    }
  }
  return out;
};

const adaptStatus = (status: IntakeStatusResponse, templateName: string): ClientIntakeStatus => {
  const submittedAt = (status.metadata?.created_at as string | undefined) ?? null;
  const submittedLabel = submittedAt ? (formatLongDate(submittedAt) ?? submittedAt) : 'Recently';
  const { kind, label } = mapStatusKind(status.status);
  const scheduledAt = (status.metadata?.consultation_scheduled_at as string | undefined) ?? null;
  const nextStep = scheduledAt
    ? `Your consultation is scheduled for ${formatLongDate(scheduledAt) ?? scheduledAt}. You'll receive a meeting link via email.`
    : kind === 'in_review' || kind === 'submitted'
      ? "We've received your intake. The practice will review it and reach out about next steps."
      : kind === 'declined'
        ? 'The practice has reviewed your intake and could not take it on at this time.'
        : null;

  return {
    intakeUuid: status.uuid,
    templateName,
    submittedAt: submittedLabel,
    status: kind,
    statusLabel: label,
    nextStep,
    timeline: buildTimeline(status),
    responses: buildResponses(status),
    notes: typeof status.metadata?.client_note === 'string' ? status.metadata.client_note : null,
  };
};

type ClientIntakesViewProps = {
  basePath: string;
  practiceName: string;
};

export const ClientIntakesView: FunctionComponent<ClientIntakesViewProps> = ({
  basePath,
  practiceName,
}) => {
  const location = useLocation();

  const intakeUuid = useMemo(() => {
    const suffix = location.path.startsWith(basePath) ? location.path.slice(basePath.length) : '';
    const segments = suffix.replace(/^\/+/, '').split('/').filter(Boolean);
    return segments[0] ? safeDecode(segments[0]) : null;
  }, [location.path, basePath]);

  const [intake, setIntake] = useState<ClientIntakeStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!intakeUuid) {
      setIntake(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    // Cache the status so navigating away from and back to this intake within
    // the intake TTL reuses the result instead of re-hitting the backend.
    // Keyed by uuid only — practiceName is applied to the cached response by
    // adaptStatus below, so it isn't part of the cache identity.
    const cacheKey = `intake:status:${intakeUuid}`;
    queryCache.coalesceGet(cacheKey, () => getIntakeStatus(intakeUuid), { ttl: policyTtl(cacheKey), swr: false })
      .then((response) => {
        if (cancelled) return;
        setIntake(adaptStatus(response, `${practiceName} Intake`));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load intake');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [intakeUuid, practiceName]);

  const onBack = useCallback(() => {
    location.route(basePath);
  }, [basePath, location]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-workspace">
        <LoadingSpinner ariaLabel="Loading intake" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col min-h-0 bg-surface-workspace">
        <DetailHeader title="Intake Forms" showBack={Boolean(intakeUuid)} onBack={intakeUuid ? onBack : undefined} />
        <div className="p-6 text-sm text-error">{error}</div>
      </div>
    );
  }

  return (
    <ClientIntakeStatusPage intake={intake} onBack={intakeUuid ? onBack : undefined} />
  );
};

export default ClientIntakesView;
