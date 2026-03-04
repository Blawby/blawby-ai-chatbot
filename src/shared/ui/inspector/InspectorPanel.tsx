import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Conversation } from '@/shared/types/conversation';
import { getUserDetail, type UserDetailRecord } from '@/shared/lib/apiClient';
import { getMatter, type BackendMatter } from '@/features/matters/services/mattersApi';
import { Button } from '@/shared/ui/Button';
import { Avatar } from '@/shared/ui/profile/atoms/Avatar';
import { XMarkIcon } from '@heroicons/react/24/outline';

type InspectorEntityType = 'conversation' | 'matter' | 'client';

type InspectorPanelProps = {
  entityType: InspectorEntityType;
  entityId: string;
  practiceId: string;
  onClose: () => void;
  conversation?: Conversation | null;
};

const formatDate = (value?: string | null) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
};

export const InspectorPanel = ({
  entityType,
  entityId,
  practiceId,
  onClose,
  conversation,
}: InspectorPanelProps) => {
  const userCacheRef = useRef<Map<string, UserDetailRecord | null>>(new Map());
  const matterCacheRef = useRef<Map<string, BackendMatter | null>>(new Map());
  const [userDetail, setUserDetail] = useState<UserDetailRecord | null>(null);
  const [matterDetail, setMatterDetail] = useState<BackendMatter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const conversationUserId = conversation?.user_id ?? null;
  const conversationMatterId = conversation?.matter_id ?? null;

  useEffect(() => {
    if (!practiceId || !entityId) return;
    const controller = new AbortController();
    setError(null);
    setIsLoading(true);

    const load = async () => {
      try {
        if (entityType === 'conversation') {
          const userId = conversationUserId;
          const matterId = conversationMatterId;

          if (userId) {
            if (userCacheRef.current.has(userId)) {
              setUserDetail(userCacheRef.current.get(userId) ?? null);
            } else {
              const detail = await getUserDetail(practiceId, userId, { signal: controller.signal });
              userCacheRef.current.set(userId, detail);
              setUserDetail(detail);
            }
          } else {
            setUserDetail(null);
          }

          if (matterId) {
            if (matterCacheRef.current.has(matterId)) {
              setMatterDetail(matterCacheRef.current.get(matterId) ?? null);
            } else {
              const detail = await getMatter(practiceId, matterId, { signal: controller.signal });
              matterCacheRef.current.set(matterId, detail);
              setMatterDetail(detail);
            }
          } else {
            setMatterDetail(null);
          }
          return;
        }

        if (entityType === 'matter') {
          if (matterCacheRef.current.has(entityId)) {
            setMatterDetail(matterCacheRef.current.get(entityId) ?? null);
          } else {
            const detail = await getMatter(practiceId, entityId, { signal: controller.signal });
            matterCacheRef.current.set(entityId, detail);
            setMatterDetail(detail);
          }
          return;
        }

        if (userCacheRef.current.has(entityId)) {
          setUserDetail(userCacheRef.current.get(entityId) ?? null);
        } else {
          const detail = await getUserDetail(practiceId, entityId, { signal: controller.signal });
          userCacheRef.current.set(entityId, detail);
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

  const title = useMemo(() => {
    if (entityType === 'conversation') return 'Conversation Info';
    if (entityType === 'matter') return 'Matter Info';
    return 'Client Info';
  }, [entityType]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-transparent">
      <div className="flex items-center justify-between border-b border-line-glass/30 px-4 py-3">
        <h2 className="text-sm font-semibold text-input-text">{title}</h2>
        <Button
          variant="icon"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close inspector"
          icon={<XMarkIcon className="h-4 w-4" />}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isLoading ? <p className="text-sm text-input-placeholder">Loading...</p> : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        {entityType === 'conversation' ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-line-glass/30 p-3">
              <p className="text-xs uppercase tracking-wide text-input-placeholder">Contact</p>
              <div className="mt-2 flex items-center gap-3">
                <Avatar
                  name={userDetail?.user?.name ?? userDetail?.user?.email ?? 'Unknown'}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-input-text">{userDetail?.user?.name ?? 'Unknown contact'}</p>
                  <p className="truncate text-xs text-input-placeholder">{userDetail?.user?.email ?? 'No email'}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-line-glass/30 p-3">
              <p className="text-xs uppercase tracking-wide text-input-placeholder">Assignment</p>
              <p className="mt-2 text-sm text-input-text">{conversation?.assigned_to ?? 'Unassigned'}</p>
            </div>

            <div className="rounded-xl border border-line-glass/30 p-3">
              <p className="text-xs uppercase tracking-wide text-input-placeholder">Linked Matter</p>
              <p className="mt-2 text-sm text-input-text">{matterDetail?.title ?? 'None linked'}</p>
              {matterDetail?.status ? (
                <p className="mt-1 text-xs text-input-placeholder">Status: {matterDetail.status}</p>
              ) : null}
            </div>

            <div className="rounded-xl border border-line-glass/30 p-3">
              <p className="text-xs uppercase tracking-wide text-input-placeholder">Metadata</p>
              <p className="mt-2 text-xs text-input-placeholder">Created: {formatDate(conversation?.created_at)}</p>
              <p className="text-xs text-input-placeholder">Last active: {formatDate(conversation?.last_message_at ?? conversation?.updated_at)}</p>
            </div>
          </div>
        ) : null}

        {entityType === 'matter' ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-line-glass/30 p-3">
              <p className="text-xs uppercase tracking-wide text-input-placeholder">Matter</p>
              <p className="mt-2 text-sm font-medium text-input-text">{matterDetail?.title ?? 'Unknown matter'}</p>
              <p className="mt-1 text-xs text-input-placeholder">Status: {matterDetail?.status ?? 'Unknown'}</p>
            </div>
            <div className="rounded-xl border border-line-glass/30 p-3">
              <p className="text-xs uppercase tracking-wide text-input-placeholder">Summary</p>
              <p className="mt-2 text-sm text-input-text">{matterDetail?.description ?? 'No summary available.'}</p>
            </div>
          </div>
        ) : null}

        {entityType === 'client' ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-line-glass/30 p-3">
              <p className="text-xs uppercase tracking-wide text-input-placeholder">Client</p>
              <div className="mt-2 flex items-center gap-3">
                <Avatar
                  name={userDetail?.user?.name ?? userDetail?.user?.email ?? 'Unknown'}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-input-text">{userDetail?.user?.name ?? 'Unknown client'}</p>
                  <p className="truncate text-xs text-input-placeholder">{userDetail?.user?.email ?? 'No email'}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-line-glass/30 p-3">
              <p className="text-xs uppercase tracking-wide text-input-placeholder">Details</p>
              <p className="mt-2 text-xs text-input-placeholder">Phone: {userDetail?.user?.phone ?? 'N/A'}</p>
              <p className="text-xs text-input-placeholder">Status: {userDetail?.status ?? 'N/A'}</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default InspectorPanel;
