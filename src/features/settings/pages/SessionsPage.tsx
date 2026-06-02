import { useState, useEffect, useCallback } from 'preact/hooks';
import { authClient } from '@/shared/lib/authClient';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
import { cn } from '@/shared/utils/cn';
import { Button } from '@/shared/ui/Button';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsCard } from '@/features/settings/components/SettingsCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionEntry {
  id: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

// ---------------------------------------------------------------------------
// Helpers — parse userAgent into device label + icon
// ---------------------------------------------------------------------------

const parseDevice = (ua: string | null | undefined): { icon: string; label: string } => {
  if (!ua) return { icon: '🖥️', label: 'Unknown device' };
  const u = ua.toLowerCase();
  const isMobile = /mobile|android|iphone|ipad/.test(u);
  const browser = /edg\//.test(u) ? 'Edge'
    : /chrome\//.test(u) ? 'Chrome'
    : /firefox\//.test(u) ? 'Firefox'
    : /safari\//.test(u) ? 'Safari'
    : 'Browser';
  const os = /windows/.test(u) ? 'Windows'
    : /mac os/.test(u) ? 'macOS'
    : /iphone/.test(u) ? 'iPhone'
    : /ipad/.test(u) ? 'iPad'
    : /android/.test(u) ? 'Android'
    : /linux/.test(u) ? 'Linux'
    : 'Unknown OS';
  const icon = isMobile ? '📱' : '💻';
  return { icon, label: `${browser} on ${os}` };
};

const formatRelative = (date: Date): string => {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 2) return 'Active now';
  if (diffMin < 60) return `Last active ${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Last active ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `Last active ${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
};


// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export interface SessionsPageProps {
  className?: string;
}

export const SessionsPage = ({ className = '' }: SessionsPageProps) => {
  const { showSuccess, showError } = useToastContext();
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      // Get the current session ID to mark "this device"
      const currentResult = await authClient.getSession();
      setCurrentSessionId(currentResult?.data?.session?.id ?? null);

      // List all active sessions for this user
      const result = await authClient.listSessions();
      const list = (result?.data ?? []) as SessionEntry[];
      setSessions(list);
    } catch {
      showError('Failed to load sessions', 'Unable to fetch your active sessions.');
    } finally {
      setIsLoading(false);
    }
  }, [showError]);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  const handleRevoke = async (session: SessionEntry) => {
    setRevokingId(session.id);
    try {
      await authClient.revokeSession({ token: session.token });
      showSuccess('Session revoked', `The session on ${parseDevice(session.userAgent).label} has been signed out.`);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
    } catch {
      showError('Failed to revoke session', 'Please try again.');
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeOthers = async () => {
    setRevokingAll(true);
    try {
      await authClient.revokeOtherSessions();
      showSuccess('Other sessions signed out', 'All other devices have been signed out.');
      if (currentSessionId != null) {
        setSessions((prev) => prev.filter((s) => s.id === currentSessionId));
      } else {
        await loadSessions();
      }
    } catch {
      showError('Failed to sign out other sessions', 'Please try again.');
    } finally {
      setRevokingAll(false);
    }
  };

  if (isLoading) return <LoadingBlock className={className} />;

  const otherCount = sessions.filter((s) => s.id !== currentSessionId).length;

  return (
    <div className={className}>
      <SettingSection first title="Your sessions" description="These are the devices currently signed into your account.">
        {otherCount > 0 && (
          <div className="flex justify-end mb-4">
            <Button variant="danger-ghost" size="sm"
              onClick={() => void handleRevokeOthers()} disabled={revokingAll}>
              {revokingAll ? 'Signing out…' : 'Sign out all other sessions'}
            </Button>
          </div>
        )}
        {sessions.length === 0 ? (
          <p className="text-sm text-dim">No active sessions found.</p>
        ) : (
          <SettingsCard className="max-w-[820px] px-0 py-0">
          <div className="flex flex-col gap-0">
            {sessions.map((session) => {
              const isCurrent = session.id === currentSessionId;
              const { icon, label } = parseDevice(session.userAgent);
              const isRevoking = revokingId === session.id;
              return (
                <div
                  key={session.id}
                  className={cn(
                    'flex items-center gap-4 p-[18px] border-b border-rule last:border-0',
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-rule-soft text-base">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-ink">
                      {label}
                      {isCurrent && (
                        <span
                          className="font-mono text-[9.5px] uppercase tracking-[0.04em] text-[var(--pos)] border rounded-full px-[7px] py-0.5"
                          style={{ background: 'color-mix(in oklab, var(--pos) 12%, var(--card))', borderColor: 'color-mix(in oklab, var(--pos) 25%, var(--rule))' }}
                        >
                          this device
                        </span>
                      )}
                    </div>
                    <div className="flex gap-3 mt-0.5">
                      {session.ipAddress && (
                        <span className="font-mono text-[11.5px] text-dim">{session.ipAddress}</span>
                      )}
                      <span className="font-mono text-[11.5px] text-dim">{formatRelative(new Date(session.updatedAt))}</span>
                    </div>
                  </div>
                  {!isCurrent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => void handleRevoke(session)}
                      disabled={isRevoking}
                    >
                      {isRevoking ? 'Revoking…' : 'Revoke'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          </SettingsCard>
        )}
      </SettingSection>
    </div>
  );
};
