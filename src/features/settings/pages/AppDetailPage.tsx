import { useState } from 'preact/hooks';
import { ComponentChildren } from 'preact';
import { App, mockConnectApp, mockDisconnectApp } from './appsData';
import { AppConnectionDialog } from '@/features/settings/components/AppConnectionDialog';
import { Button } from '@/shared/ui/Button';
import { ChevronLeft } from 'lucide-preact';
import { Icon } from '@/shared/ui/Icon';
import { SettingRow } from '@/features/settings/components/SettingRow';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsBadge } from '@/features/settings/components/SettingsBadge';
import { SettingsCard } from '@/features/settings/components/SettingsCard';
import { Input } from '@/shared/ui/input';
import { MoreVertical, Globe, Puzzle, Settings } from 'lucide-preact';

import { useToastContext } from '@/shared/contexts/ToastContext';
import { useTranslation } from '@/shared/i18n/hooks';
import { formatDate } from '@/shared/utils/dateTime';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/shared/ui/dropdown';

interface AppDetailPageProps {
  app: App;
  onBack: () => void;
  onUpdate: (appId: string, updates: Partial<App>) => void;
}

export const AppDetailPage = ({ app, onBack, onUpdate }: AppDetailPageProps) => {
  const { t } = useTranslation(['settings']);
  const { showSuccess, showError } = useToastContext();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const isComingSoon = Boolean(app.comingSoon);

  const handleConnectClick = () => {
    setShowConnectModal(true);
  };

  const handleConnect = async () => {
    setShowConnectModal(false);
    setIsConnecting(true);
    try {
      const result = await mockConnectApp(app.id);
      onUpdate(app.id, { connected: true, connectedAt: result.connectedAt });
      showSuccess(
        t('settings:apps.clio.toasts.connectSuccess.title'),
        t('settings:apps.clio.toasts.connectSuccess.body')
      );
    } catch (error) {
      console.error(error);
      showError(
        t('settings:apps.clio.toasts.error.title'),
        t('settings:apps.clio.toasts.error.body')
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await mockDisconnectApp(app.id);
      onUpdate(app.id, { connected: false, connectedAt: undefined });
      showSuccess(
        t('settings:apps.clio.toasts.disconnectSuccess.title'),
        t('settings:apps.clio.toasts.disconnectSuccess.body')
      );
    } catch (error) {
      console.error(error);
      showError(
        t('settings:apps.clio.toasts.error.title'),
        t('settings:apps.clio.toasts.error.body')
      );
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleOpenSettings = () => {
    if (!app.website) return;
    try {
      window.open(app.website, '_blank', 'noopener,noreferrer');
    } catch (_err) {
      // ignore - defensive in case window.open is unavailable
    }
  };

  return (
    <div>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-dim hover:text-ink mb-6 transition-colors">
        <Icon icon={ChevronLeft} className="h-3.5 w-3.5" />
        Apps
      </button>
      <div className="space-y-6">
      <SettingsCard className="max-w-[860px]">
        <SettingRow
          label={app.name}
          labelNode={(
            <div className="flex items-center gap-4">
              <div className="field w-16 h-16 rounded-full flex items-center justify-center border border-line-subtle overflow-hidden">
                {app.logo ? (
                  <img
                    src={app.logo}
                    alt={`${app.name} logo`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <Icon icon={Puzzle} className="w-8 h-8 text-ink/80" aria-hidden="true"  />
                )}
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-ink">{app.name}</h2>
                {isComingSoon && (
                  <SettingsBadge variant="warning">
                    {t('settings:apps.comingSoon')}
                  </SettingsBadge>
                )}
              </div>
            </div>
          )}
        >
          <div className="flex items-center gap-2">
            <Button
              variant={app.connected ? 'secondary' : 'primary'}
              size="sm"
              onClick={app.connected ? handleDisconnect : handleConnectClick}
              disabled={isConnecting || isDisconnecting || (!app.connected && isComingSoon)}
            >
              {isConnecting
                ? t('common:actions.loading')
                : isDisconnecting
                  ? t('common:actions.loading')
                  : app.connected
                    ? t('settings:apps.clio.disconnect')
                    : isComingSoon
                      ? t('settings:apps.comingSoon')
                      : t('settings:apps.clio.connect')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="More options"
                  icon={MoreVertical} iconClassName="w-5 h-5"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={handleOpenSettings} disabled={!app.website}>
                  <div className="flex items-center gap-2">
                    <Icon icon={Settings} className="w-4 h-4" aria-hidden="true"  />
                    <span>{t('settings:apps.clio.settings')}</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SettingRow>
      </SettingsCard>

      <SettingSection first title={t('settings:apps.clio.information')} className="pt-0">
        <SettingsCard className="max-w-[860px]">
          {app.connected && app.connectedAt && (
            <InfoRowSimple 
              label={t('settings:apps.clio.connectedOn')} 
              value={formatDate(app.connectedAt)} 
            />
          )}
          <InfoRowSimple label={t('settings:apps.clio.category')} value={app.category} />
          <InfoRowSimple label={t('settings:apps.clio.developer')} value={app.developer} />
          <InfoRowSimple
            label={t('settings:apps.clio.website')}
            value={
              <a
                href={app.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-accent dark:text-accent"
              >
                {app.website}
                <Icon icon={Globe} className="w-4 h-4" aria-hidden="true"  />
              </a>
            }
          />
          <InfoRowSimple
            label={t('settings:apps.clio.privacyPolicy')}
            value={
              <a
                href={app.privacyPolicy}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-accent dark:text-accent"
              >
                {app.privacyPolicy}
                <Icon icon={Globe} className="w-4 h-4" aria-hidden="true"  />
              </a>
            }
          />
        </SettingsCard>
      </SettingSection>

      {app.actions && app.actions.length > 0 && (
        <SettingSection title={t('settings:apps.clio.actions')}>
          <SettingsCard className="max-w-[860px]">
          <div className="space-y-6">
            {app.actions.map((action) => (
              <div key={action.name} className="space-y-2 w-full">
                <code className="text-sm font-mono font-semibold text-ink block w-full">
                  {action.name}
                </code>
                {action.hasMetadata && (
                  <span className="text-xs font-medium text-dim-2 block w-full">
                    METADATA
                  </span>
                )}
                <p className="text-sm text-dim-2 font-normal w-full">
                  {action.description}
                </p>
                {action.visibility && (
                  <div className="space-y-1 w-full">
                    <Input
                      type="text"
                      label="Visibility"
                      value={action.visibility}
                      readOnly
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          </SettingsCard>
        </SettingSection>
      )}

      <AppConnectionDialog
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        app={app}
        onConnect={handleConnect}
      />
    </div>
    </div>
  );
};

interface InfoRowSimpleProps {
  label: string;
  value: string | ComponentChildren;
}

const InfoRowSimple = ({ label, value }: InfoRowSimpleProps) => {
  return (
    <SettingRow label={label}>
      <span className="text-sm text-ink text-right break-all">
        {value}
      </span>
    </SettingRow>
  );
};
