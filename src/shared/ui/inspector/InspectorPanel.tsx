import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Conversation } from '@/shared/types/conversation';
import { getUserDetail, type UserDetailRecord } from '@/shared/lib/apiClient';
import { getMatter, type BackendMatter } from '@/features/matters/services/mattersApi';
import { MatterStatusPopover } from '@/features/matters/components/MatterStatusPopover';
import { isMatterStatus, type MatterStatus } from '@/shared/types/matterStatus';
import { InvoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge';
import type { InvoiceStatus } from '@/features/invoices/types';
import { Button } from '@/shared/ui/Button';
import {
  InfoRow,
  InspectorGroup,
  InspectorHeaderEntity,
  InspectorHeaderPerson,
  SkeletonRow,
} from './InspectorPrimitives';
import { XMarkIcon } from '@heroicons/react/24/outline';

type InspectorConfig =
  | { type: 'conversation' }
  | { type: 'matter' }
  | { type: 'client' }
  | { type: 'invoice' };

type InspectorEntityType = InspectorConfig['type'];

type InspectorPanelProps = {
  entityType: InspectorEntityType;
  entityId: string;
  practiceId: string;
  onClose: () => void;
  conversation?: Conversation | null;
  matterClientName?: string | null;
  matterAssigneeNames?: string[];
  matterBillingLabel?: string | null;
  matterCreatedLabel?: string | null;
  matterUpdatedLabel?: string | null;
  onMatterStatusChange?: (status: MatterStatus) => void;
  invoiceClientName?: string | null;
  invoiceMatterTitle?: string | null;
  invoiceStatus?: string | null;
  invoiceTotal?: string | null;
  invoiceAmountDue?: string | null;
  invoiceDueDate?: string | null;
};

const formatDate = (value?: string | null) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
};

const isValidMatterStatus = (value: unknown): value is MatterStatus =>
  typeof value === 'string' && isMatterStatus(value);

const isValidInvoiceStatus = (value: unknown): value is InvoiceStatus =>
  typeof value === 'string' && ['draft', 'pending', 'sent', 'open', 'overdue', 'paid', 'void', 'cancelled'].includes(value);

export const InspectorPanel = ({
  entityType,
  entityId,
  practiceId,
  onClose,
  conversation,
  matterClientName,
  matterAssigneeNames,
  matterBillingLabel,
  matterCreatedLabel,
  matterUpdatedLabel,
  onMatterStatusChange,
  invoiceClientName,
  invoiceMatterTitle,
  invoiceStatus,
  invoiceTotal,
  invoiceAmountDue,
  invoiceDueDate,
}: InspectorPanelProps) => {
  const userCacheRef = useRef<Map<string, UserDetailRecord | null>>(new Map());
  const matterCacheRef = useRef<Map<string, BackendMatter | null>>(new Map());
  const [userDetail, setUserDetail] = useState<UserDetailRecord | null>(null);
  const [matterDetail, setMatterDetail] = useState<BackendMatter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const lastPracticeIdRef = useRef<string | null>(practiceId);

  const conversationUserId = conversation?.user_id ?? null;
  const conversationMatterId = conversation?.matter_id ?? null;

  const makeCacheKey = (pId: string, eId: string) => `${pId}:${eId}`;

  useEffect(() => {
    if (lastPracticeIdRef.current !== practiceId) {
      userCacheRef.current.clear();
      matterCacheRef.current.clear();
      lastPracticeIdRef.current = practiceId;
    }
  }, [practiceId]);

  useEffect(() => {
    setUserDetail(null);
    setMatterDetail(null);
    if (!practiceId || !entityId) return;
    const controller = new AbortController();
    setError(null);
    setIsLoading(true);

    const load = async () => {
      try {
        if (entityType === 'invoice') {
          return;
        }

        if (entityType === 'conversation') {
          const userId = conversationUserId;
          const matterId = conversationMatterId;

          if (userId) {
            const cacheKey = makeCacheKey(practiceId, userId);
            if (userCacheRef.current.has(cacheKey)) {
              setUserDetail(userCacheRef.current.get(cacheKey) ?? null);
            } else {
              const detail = await getUserDetail(practiceId, userId, { signal: controller.signal });
              userCacheRef.current.set(cacheKey, detail);
              setUserDetail(detail);
            }
          }

          if (matterId) {
            const cacheKey = makeCacheKey(practiceId, matterId);
            if (matterCacheRef.current.has(cacheKey)) {
              setMatterDetail(matterCacheRef.current.get(cacheKey) ?? null);
            } else {
              const detail = await getMatter(practiceId, matterId, { signal: controller.signal });
              matterCacheRef.current.set(cacheKey, detail);
              setMatterDetail(detail);
            }
          }
          return;
        }

        const cacheKey = makeCacheKey(practiceId, entityId);
        if (entityType === 'matter') {
          if (matterCacheRef.current.has(cacheKey)) {
            setMatterDetail(matterCacheRef.current.get(cacheKey) ?? null);
          } else {
            const detail = await getMatter(practiceId, entityId, { signal: controller.signal });
            matterCacheRef.current.set(cacheKey, detail);
            setMatterDetail(detail);
          }
          return;
        }

        if (userCacheRef.current.has(cacheKey)) {
          setUserDetail(userCacheRef.current.get(cacheKey) ?? null);
        } else {
          const detail = await getUserDetail(practiceId, entityId, { signal: controller.signal });
          userCacheRef.current.set(cacheKey, detail);
          setUserDetail(detail);
        }
      } catch (nextError: unknown) {
        if ((nextError as DOMException)?.name === 'AbortError') return;
        setError(nextError instanceof Error ? nextError.message : 'Failed to load inspector data');
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => controller.abort();
  }, [conversationMatterId, conversationUserId, entityId, entityType, practiceId]);

  const conversationSkeletonRows = useMemo(() => [0, 1, 2, 3], []);
  const clientSkeletonRows = useMemo(() => [0, 1, 2], []);
  const matterSkeletonRows = useMemo(() => [0, 1, 2, 3], []);
  const matterStatus = isValidMatterStatus(matterDetail?.status) ? matterDetail.status : null;
  const canEditMatterStatus = Boolean(onMatterStatusChange && matterDetail && !isLoading && matterStatus);
  const handleMatterStatusSelect = (status: MatterStatus) => {
    if (canEditMatterStatus && onMatterStatusChange) {
      onMatterStatusChange(status);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-transparent">
      <div className="flex items-center justify-between border-b border-line-glass/30 px-4 py-3">
        <h2 className="text-sm font-semibold text-input-text">
          {entityType === 'conversation'
            ? 'Conversation Info'
            : entityType === 'matter'
              ? 'Matter Info'
              : entityType === 'invoice'
                ? 'Invoice Info'
                : 'Client Info'}
        </h2>
        <Button
          variant="icon"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close inspector"
          icon={<XMarkIcon className="h-4 w-4" />}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && entityType === 'conversation' ? (
          <div className="py-3">
            {conversationSkeletonRows.map((row) => (
              <SkeletonRow key={`conversation-skeleton-${row}`} wide={row % 2 === 0} />
            ))}
          </div>
        ) : null}
        {isLoading && entityType === 'client' ? (
          <div className="py-3">
            {clientSkeletonRows.map((row) => (
              <SkeletonRow key={`client-skeleton-${row}`} wide={row === 0} />
            ))}
          </div>
        ) : null}
        {isLoading && entityType === 'matter' ? (
          <div className="py-3">
            {matterSkeletonRows.map((row) => (
              <SkeletonRow key={`matter-skeleton-${row}`} wide={row === 0 || row === 2} />
            ))}
          </div>
        ) : null}
        {error ? <p className="px-4 py-3 text-sm text-red-400">{error}</p> : null}

        {entityType === 'conversation' && !isLoading ? (
          <div className="pb-4">
            <InspectorHeaderPerson
              name={userDetail?.user?.name ?? userDetail?.user?.email ?? 'Unknown'}
              secondaryLine={userDetail?.user?.email ?? undefined}
            />
            <div className="border-t border-white/[0.06]">
              <InspectorGroup label="CONTACT">
                <InfoRow label="Phone" value={userDetail?.user?.phone ?? undefined} muted={!userDetail?.user?.phone} />
                <InfoRow label="Status" value={userDetail?.status ?? undefined} />
              </InspectorGroup>
              <InspectorGroup label="MATTER">
                <InfoRow label="Linked" value={matterDetail?.title ?? undefined} muted={!matterDetail} />
                <InfoRow label="Status" value={matterDetail?.status ?? undefined} muted={!matterDetail?.status} />
              </InspectorGroup>
              <InspectorGroup label="ASSIGNMENT">
                <InfoRow label="Assigned to" value={conversation?.assigned_to ?? undefined} muted={!conversation?.assigned_to} />
              </InspectorGroup>
              <InspectorGroup label="METADATA">
                <InfoRow label="Created" value={formatDate(conversation?.created_at)} />
                <InfoRow label="Last active" value={formatDate(conversation?.last_message_at ?? conversation?.updated_at)} />
              </InspectorGroup>
            </div>
          </div>
        ) : null}

        {entityType === 'matter' && !isLoading ? (
          <div className="pb-4">
            <InspectorHeaderEntity
              chip="MATTER"
              title={matterDetail?.title ?? 'Matter'}
              subtitle={matterClientName ?? undefined}
              statusBadge={(
                matterStatus ? (
                  <MatterStatusPopover
                    currentStatus={matterStatus}
                    onSelect={handleMatterStatusSelect}
                    disabled={!canEditMatterStatus}
                  />
                ) : (
                  <span className="text-[11px] text-input-placeholder">—</span>
                )
              )}
            />
            <div className="border-t border-white/[0.06]">
              <InspectorGroup label="PEOPLE">
                <InfoRow label="Client" value={matterClientName ?? undefined} muted={!matterClientName} />
                <InfoRow
                  label="Assignees"
                  value={matterAssigneeNames && matterAssigneeNames.length > 0 ? matterAssigneeNames.join(', ') : undefined}
                  muted={!matterAssigneeNames?.length}
                />
              </InspectorGroup>
              <InspectorGroup label="BILLING">
                <InfoRow label="Type" value={matterBillingLabel ?? undefined} muted={!matterBillingLabel} />
              </InspectorGroup>
              <InspectorGroup label="DATES">
                <InfoRow label="Created" value={matterCreatedLabel ?? undefined} />
                <InfoRow label="Updated" value={matterUpdatedLabel ?? undefined} />
              </InspectorGroup>
            </div>
          </div>
        ) : null}

        {entityType === 'client' && !isLoading ? (
          <div className="pb-4">
            <InspectorHeaderPerson
              name={userDetail?.user?.name ?? userDetail?.user?.email ?? 'Unknown'}
              secondaryLine={userDetail?.user?.email ?? undefined}
            />
            <div className="border-t border-white/[0.06]">
              <InspectorGroup label="CONTACT">
                <InfoRow label="Email" value={userDetail?.user?.email ?? undefined} muted={!userDetail?.user?.email} />
                <InfoRow label="Phone" value={userDetail?.user?.phone ?? undefined} muted={!userDetail?.user?.phone} />
              </InspectorGroup>
              <InspectorGroup label="DETAILS">
                <InfoRow label="Status" value={userDetail?.status ?? undefined} />
              </InspectorGroup>
            </div>
          </div>
        ) : null}

        {entityType === 'invoice' ? (
          <div className="pb-4">
            <InspectorHeaderEntity
              chip="INVOICE"
              title={invoiceMatterTitle ?? 'Invoice'}
              subtitle={invoiceClientName ?? undefined}
              statusBadge={
                isValidInvoiceStatus(invoiceStatus)
                  ? <InvoiceStatusBadge status={invoiceStatus} />
                  : <span className="text-[11px] text-input-placeholder">—</span>
              }
            />
            <div className="border-t border-white/[0.06]">
              <InspectorGroup label="DETAILS">
                <InfoRow label="Client" value={invoiceClientName ?? undefined} muted={!invoiceClientName} />
                <InfoRow label="Matter" value={invoiceMatterTitle ?? undefined} muted={!invoiceMatterTitle} />
                <InfoRow label="Due" value={invoiceDueDate ?? undefined} muted={!invoiceDueDate} />
              </InspectorGroup>
              <InspectorGroup label="BILLING">
                <InfoRow label="Total" value={invoiceTotal ?? undefined} muted={!invoiceTotal} />
                <InfoRow label="Amount due" value={invoiceAmountDue ?? undefined} muted={!invoiceAmountDue} />
              </InspectorGroup>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default InspectorPanel;
