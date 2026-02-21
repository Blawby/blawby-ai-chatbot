import { useState } from 'preact/hooks';
import { ComponentChildren } from 'preact';
import { App, mockConnectApp, mockDisconnectApp } from './appsData';
import { AppConnectionModal } from '@/features/settings/components/AppConnectionModal';
import { Button } from '@/shared/ui/Button';
import { SectionDivider } from '@/shared/ui/layout';
import { SettingRow } from '@/features/settings/components/SettingRow';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsPageLayout } from '@/features/settings/components/SettingsPageLayout';
import { SettingsBadge } from '@/features/settings/components/SettingsBadge';
import { Input } from '@/shared/ui/input';
import { ArrowLeftIcon, EllipsisVerticalIcon, GlobeAltIcon, PuzzlePieceIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useTranslation } from '@/shared/i18n/hooks';
import { formatDate } from '@/shared/utils/dateTime';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/shared/ui/dropdown';
import { useWorkspaceResolver } from '@/shared/hooks/useWorkspaceResolver';
import { DocumentDuplicateIcon, CheckIcon } from '@heroicons/react/24/outline';

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

  const { practices, currentPractice } = useWorkspaceResolver();
  const slug = currentPractice?.slug ?? practices[0]?.slug ?? 'your-practice-slug';
  const [copiedScript, setCopiedScript] = useState(false);

  const messengerSnippet = `<script>
  window.BlawbyWidget = {
    practiceSlug: '${slug}',
  };
</script>
<script src="https://ai.blawby.com/widget-loader.js" defer></script>`;

  const copySnippet = () => {
    navigator.clipboard.writeText(messengerSnippet).then(() => {
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
      showSuccess('Code copied to clipboard', 'You can now paste it into your website.');
    });
  };

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
    window.open(app.website, '_blank', 'noopener,noreferrer');
  };

  return (
    <SettingsPageLayout
      title={app.name}
      wrapChildren={false}
      contentClassName="pb-6"
      headerLeading={(
        <Button
          variant="icon"
          size="icon"
          onClick={onBack}
          aria-label={t('settings:navigation.backToSettings')}
          icon={<ArrowLeftIcon className="w-5 h-5" />}
        />
      )}
    >
      <div className="pt-2 pb-6">
        <SettingRow
          label={app.name}
          labelNode={(
            <div className="flex items-center gap-4">
              <div className="glass-input w-16 h-16 rounded-full flex items-center justify-center border border-line-glass/30 overflow-hidden">
                {app.logo ? (
                  <img
                    src={app.logo}
                    alt={`${app.name} logo`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <PuzzlePieceIcon className="w-8 h-8 text-input-text/80" aria-hidden="true" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-input-text">{app.name}</h2>
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
              disabled={app.id === 'blawby-messenger' || isConnecting || isDisconnecting || (!app.connected && isComingSoon)}
            >
              {isConnecting
                ? t('common:actions.loading')
                : isDisconnecting
                  ? t('common:actions.loading')
                  : app.id === 'blawby-messenger'
                    ? 'Enabled'
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
                  icon={<EllipsisVerticalIcon className="w-5 h-5" />}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={handleOpenSettings}>
                  <div className="flex items-center gap-2">
                    <Cog6ToothIcon className="w-4 h-4" aria-hidden="true" />
                    <span>{t('settings:apps.clio.settings')}</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SettingRow>
      </div>

      <SectionDivider />

      {/* Blawby Messenger custom integration block */}
      {app.id === 'blawby-messenger' && (
        <>
          <SettingSection title="Integration Guide" className="py-6">
            <div className="space-y-4">
              <p className="text-sm text-secondary">
                To add the chat widget to your website, copy the code snippet below and paste it into the <code>&lt;head&gt;</code> or just before the closing <code>&lt;/body&gt;</code> tag of your website.
              </p>
              
              <div className="relative group">
                <pre className="bg-elevation-2 rounded-lg p-4 text-sm font-mono text-accent-100 overflow-x-auto border border-line-glass/30">
                  {messengerSnippet}
                </pre>
                <Button
                  variant="secondary"
                  size="sm"
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-elevation-3 hover:bg-elevation-4 border-line-glass/30"
                  icon={copiedScript ? <CheckIcon className="w-4 h-4 text-green-500" /> : <DocumentDuplicateIcon className="w-4 h-4" />}
                  onClick={copySnippet}
                >
                  {copiedScript ? 'Copied' : 'Copy'}
                </Button>
              </div>

              <div className="rounded-md bg-accent-500/10 p-4 border border-accent-500/20 mt-4">
                <h4 className="text-sm font-medium text-accent-400 mb-2">Advanced: Custom Domain Linking</h4>
                <p className="text-sm text-secondary mb-3">
                  To eliminate third-party cookie restrictions and make the chat widget seamlessly part of your site, point a subdomain (e.g., <code>chat.yourfirm.com</code>) to Blawby using a CNAME record.
                </p>
                <ul className="list-disc list-inside text-sm text-secondary space-y-1">
                  <li>Create a CNAME record for your subdomain pointing to <code>blawby.com</code></li>
                  <li>In the widget snippet above, add: <code>baseUrl: 'https://chat.yourfirm.com'</code></li>
                </ul>
              </div>
            </div>
          </SettingSection>

          <SectionDivider />
        </>
      )}

      {/* Information */}
      <SettingSection title={t('settings:apps.clio.information')} className="py-6">
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
                className="inline-flex items-center gap-1 text-accent-600 dark:text-accent-400"
              >
                {app.website}
                <GlobeAltIcon className="w-4 h-4" aria-hidden="true" />
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
                className="inline-flex items-center gap-1 text-accent-600 dark:text-accent-400"
              >
                {app.privacyPolicy}
                <GlobeAltIcon className="w-4 h-4" aria-hidden="true" />
              </a>
            }
          />
      </SettingSection>

      <SectionDivider />

      {/* Actions */}
      {app.actions && app.actions.length > 0 && (
        <SettingSection title={t('settings:apps.clio.actions')} className="py-6">
          <div className="space-y-6">
            {app.actions.map((action) => (
              <div key={action.name} className="space-y-2 w-full">
                <code className="text-sm font-mono font-semibold text-input-text block w-full">
                  {action.name}
                </code>
                {action.hasMetadata && (
                  <span className="text-xs font-medium text-input-placeholder block w-full">
                    METADATA
                  </span>
                )}
                <p className="text-sm text-input-placeholder font-normal w-full">
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
        </SettingSection>
      )}

      <AppConnectionModal
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        app={app}
        onConnect={handleConnect}
      />
    </SettingsPageLayout>
  );
};

interface InfoRowSimpleProps {
  label: string;
  value: string | ComponentChildren;
}

const InfoRowSimple = ({ label, value }: InfoRowSimpleProps) => {
  return (
    <SettingRow label={label}>
      <span className="text-sm text-input-text text-right break-all">
        {value}
      </span>
    </SettingRow>
  );
};
