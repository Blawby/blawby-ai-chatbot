// Add global typing for window.showToast
declare global {
  interface Window {
    showToast?: (opts: { type: string; message: string }) => void;
  }
}


import { useMemo, useState } from 'preact/hooks';
import { SettingRow, SettingsHelperText } from '@/features/settings/components';
import { cn } from '@/shared/utils/cn';
import { Button } from '@/shared/ui/Button';
import { Switch } from '@/shared/ui/input/Switch';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { usePracticeTeam } from '@/shared/hooks/usePracticeTeam';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { useSessionContext, useMemberRoleContext } from '@/shared/contexts/SessionContext';
import { normalizePracticeRole } from '@/shared/utils/practiceRoles';
import { useLocation } from 'preact-iso';
interface PracticeService {
  id?: string;
  name?: string;
  title?: string;
  [key: string]: unknown;
}

interface PracticeOverviewPageProps {
  className?: string;
  onNavigate?: (path: string) => void;
}



const summarizeList = (
  items: string[],
  visibleCount = 3,
  emptyLabel = 'None configured'
): string => {
  if (items.length === 0) return emptyLabel;
  if (items.length <= visibleCount) return items.join(', ');
  return `${items.slice(0, visibleCount).join(', ')}, +${items.length - visibleCount} more`;
};

export const PracticeOverviewPage = ({
  className,
  onNavigate,
}: PracticeOverviewPageProps) => {
  const { session } = useSessionContext();
  const { activeMemberRole } = useMemberRoleContext();
  const { currentPractice, updatePracticeDetails } = usePracticeManagement({ fetchPracticeDetails: true });
  const practice = currentPractice ?? null;
  const practiceId = practice?.id ?? null;
  const currentUserId = session?.user?.id ?? null;
  const currentUserEmail = session?.user?.email?.toLowerCase() ?? null;

  const { details: practiceDetails = {} } = usePracticeDetails(practiceId);
  const { members = [] } = usePracticeTeam(practiceId, currentUserId, {
    enabled: Boolean(practiceId),
  });

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const currentMember = useMemo(() => {
    if (!currentUserEmail && !currentUserId) return null;

    return (
      members.find((member) => member?.email?.toLowerCase() === currentUserEmail) ??
      members.find((member) => member?.userId === currentUserId) ??
      null
    );
  }, [members, currentUserEmail, currentUserId]);

  const currentUserRole =
    normalizePracticeRole(activeMemberRole) ??
    normalizePracticeRole(currentMember?.role) ??
    'member';

  const isOwner = currentUserRole === 'owner';

  const servicesList = useMemo(() => {
    const source = practiceDetails?.services ?? practice?.services ?? [];
    if (!Array.isArray(source)) return [];

    const values = source
      .map((entry: PracticeService | string) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object') {
          if (typeof entry.name === 'string') return entry.name;
          if (typeof entry.title === 'string') return entry.title;
        }
        return '';
      })
      .filter((value: string) => Boolean(value));

    return Array.from(new Set(values));
  }, [practiceDetails?.services, practice?.services]);

  const licensedStates = useMemo(() => {
    const source = Array.isArray(practiceDetails?.serviceStates)
      ? practiceDetails.serviceStates
      : [];

    return Array.from(new Set(
      source.filter((value: unknown): value is string => typeof value === 'string')
    ));
  }, [practiceDetails?.serviceStates]);

  const websiteValue = practiceDetails?.website || '';
  const phoneValue = practice?.businessPhone || '';

  const addressSummary = useMemo(() => {
    const address = practiceDetails?.address;
    if (!address || typeof address !== 'object') return '';

    const parts = [
      (address as Record<string, unknown>).address,
      (address as Record<string, unknown>).apartment,
      (address as Record<string, unknown>).city,
      (address as Record<string, unknown>).state,
      (address as Record<string, unknown>).postalCode,
      (address as Record<string, unknown>).country,
    ].filter(Boolean);

    return parts.join(', ');
  }, [practiceDetails?.address]);

  const practiceAreasSummary = summarizeList(servicesList, 3, 'No practice areas');
  const licensedStatesSummary = summarizeList(licensedStates, 3, 'No licensed states');
  const teamSummary =
    members.length > 0
      ? `${members.length} member${members.length === 1 ? '' : 's'}`
      : 'No team members';


  const publicListingEnabled = typeof practiceDetails?.isPublic === 'boolean' ? practiceDetails.isPublic : false;
  const [optimisticPublicListing, setOptimisticPublicListing] = useState<boolean | null>(null);

  const workspaceUrlLabel = practice?.slug ? `/public/${practice.slug}` : 'No workspace URL';
  const workspaceUrlHref = practice?.slug ? `/public/${practice.slug}` : null;

  const { route } = useLocation();
  const nav = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
      return;
    }
    route(path);
  };

  const openHref = (href: string) => {
    if (typeof window !== 'undefined') {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  };

  // (removed duplicate toSettingsPath)
  // Build correct settings path with practice slug
  const toSettingsPath = (subPath: string) => {
    if (!practice?.slug) return '/';
    // Remove leading slashes from subPath
    const clean = subPath.replace(/^\/+/, '');
    return `/practice/${encodeURIComponent(practice.slug)}/settings/${clean}`;
  };

  return (
    <div className={cn('space-y-8', className)}>
      <SettingRow
        label="Practice overview"
        labelNode={
          <div className="flex items-center gap-4">
            <div className="glass-panel flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl">
              {practice?.logo ? (
                <img src={practice.logo} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-base font-semibold text-input-text">
                  {(practice?.name || 'P').slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="text-base font-medium text-input-text">
                {practice?.name || 'Practice'}
              </h3>
              <SettingsHelperText className="truncate">
                Public listing and workspace URL
              </SettingsHelperText>
            </div>
          </div>
        }
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() => nav(toSettingsPath('practice/contact'))}
        >
          Manage
        </Button>
      </SettingRow>

      <SettingRow
        label="Workspace URL"
        labelNode={
          <div>
            <h3 className="text-sm font-semibold text-input-text">Workspace URL</h3>
            <SettingsHelperText>{workspaceUrlLabel}</SettingsHelperText>
          </div>
        }
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (workspaceUrlHref) openHref(workspaceUrlHref);
          }}
          disabled={!workspaceUrlHref}
        >
          Open
        </Button>
      </SettingRow>

      <SettingRow
        label="Contact"
        labelNode={
          <div>
            <h3 className="text-sm font-semibold text-input-text">Contact</h3>
            <SettingsHelperText>
              {[websiteValue, phoneValue, addressSummary].filter(Boolean).join(' • ') ||
                'No contact details configured'}
            </SettingsHelperText>
          </div>
        }
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            nav(
              `${toSettingsPath('practice/contact')}?returnTo=${encodeURIComponent(
                toSettingsPath('practice')
              )}`
            )
          }
        >
          Manage
        </Button>
      </SettingRow>

      <SettingRow
        label="Services"
        labelNode={
          <div>
            <h3 className="text-sm font-semibold text-input-text">
              Practice areas and licensed states
            </h3>
            <SettingsHelperText>{practiceAreasSummary}</SettingsHelperText>
            <SettingsHelperText>{licensedStatesSummary}</SettingsHelperText>
          </div>
        }
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() => nav(toSettingsPath('practice/coverage'))}
        >
          Manage
        </Button>
      </SettingRow>

      <SettingRow
        label="Payouts"
        labelNode={
          <div>
            <h3 className="text-sm font-semibold text-input-text">Payouts</h3>
            <SettingsHelperText>Banking and payout setup</SettingsHelperText>
          </div>
        }
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() => nav(toSettingsPath('practice/payouts'))}
        >
          Manage
        </Button>
      </SettingRow>

      <SettingRow
        label="Team and access"
        labelNode={
          <div>
            <h3 className="text-sm font-semibold text-input-text">Team and access</h3>
            <SettingsHelperText>{teamSummary}</SettingsHelperText>
          </div>
        }
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() => nav(toSettingsPath('practice/team'))}
        >
          Manage
        </Button>
      </SettingRow>

      <SettingRow
        label="Apps and integrations"
        labelNode={
          <div>
            <h3 className="text-sm font-semibold text-input-text">Apps and integrations</h3>
            <SettingsHelperText>Connected tools and messaging</SettingsHelperText>
          </div>
        }
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() => nav(toSettingsPath('apps'))}
        >
          Manage
        </Button>
      </SettingRow>




      <SettingRow
        label="Public listing"
        labelNode={
          <div>
            <h3 className="text-sm font-semibold text-input-text">Public listing</h3>
            <SettingsHelperText>
              {publicListingEnabled
                ? 'Your practice appears in public listings'
                : 'Your practice is private'}
            </SettingsHelperText>
          </div>
        }
      >
        {isOwner ? (
          <Switch
            value={optimisticPublicListing !== null ? optimisticPublicListing : publicListingEnabled}
            onChange={async (checked) => {
              if (!practice?.id) return;
              setOptimisticPublicListing(checked); // optimistic UI
              try {
                await updatePracticeDetails(practice.id, { isPublic: checked });
              } catch (_err) {
                if (typeof window !== 'undefined' && window?.showToast) {
                  window.showToast({
                    type: 'error',
                    message: 'Failed to update public listing. Please try again.'
                  });
                }
                setOptimisticPublicListing(null); // revert
              }
            }}
            label={(optimisticPublicListing !== null ? optimisticPublicListing : publicListingEnabled) ? 'Public' : 'Private'}
            disabled={!practice?.id}
            data-public-listing-switch
          />
        ) : (
          <span className="text-input-placeholder">{publicListingEnabled ? 'Public' : 'Private'}</span>
        )}
      </SettingRow>

      {showDeleteModal && (
        <div className="glass-panel rounded-xl border border-accent-error/30 p-4">
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-accent-error">Delete practice</h4>
            <p className="text-sm text-input-text">
              Replace this block with your existing delete modal flow.
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowDeleteModal(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const PracticePage = PracticeOverviewPage;
export default PracticeOverviewPage;
