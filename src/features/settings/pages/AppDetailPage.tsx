import { useState, useRef, useEffect } from 'preact/hooks';
import { ComponentChildren } from 'preact';
import { useLocation } from 'preact-iso';
import { App, mockConnectApp, mockDisconnectApp } from './appsData';
import { AppConnectionDialog } from '@/features/settings/components/AppConnectionDialog';
import { Button } from '@/shared/ui/Button';
import { SectionDivider, SettingsPage } from '@/shared/ui/layout';
import { SettingRow } from '@/features/settings/components/SettingRow';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsBadge } from '@/features/settings/components/SettingsBadge';
import { Input } from '@/shared/ui/input';
import { EllipsisVerticalIcon, GlobeAltIcon, PuzzlePieceIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useNavigation } from '@/shared/utils/navigation';
import { useTranslation } from '@/shared/i18n/hooks';
import { formatDate } from '@/shared/utils/dateTime';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/shared/ui/dropdown';
import { useWorkspaceResolver } from '@/shared/hooks/useWorkspaceResolver';
import { buildSettingsPath, resolveSettingsBasePath } from '@/shared/utils/workspace';
import { DocumentDuplicateIcon, CheckIcon } from '@heroicons/react/24/outline';
import { Icon } from '@/shared/ui/Icon';

interface AppDetailPageProps {
  app: App;
  onBack: () => void;
  onUpdate: (appId: string, updates: Partial<App>) => void;
}

const copyToClipboardWithFallback = async (value: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error('Failed to copy text');
  }
};

export const AppDetailPage = ({ app, onBack, onUpdate }: AppDetailPageProps) => {
  const { t } = useTranslation(['settings']);
  const { showSuccess, showError } = useToastContext();
  const location = useLocation();
  const settingsBasePath = resolveSettingsBasePath(location.path);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const isComingSoon = Boolean(app.comingSoon);

  const { practices, currentPractice } = useWorkspaceResolver();
  const slug = currentPractice?.slug ?? practices[0]?.slug;
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedTrackingScript, setCopiedTrackingScript] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const widgetLoaderBaseUrl = (
    import.meta.env.VITE_APP_BASE_URL
    || (typeof window !== 'undefined' ? window.location.origin : '')
  ).replace(/\/+$/, '');
  const widgetLoaderSrc = `${widgetLoaderBaseUrl}/widget-loader.js`;
  const widgetBaseUrl = new URL(
    widgetLoaderSrc,
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  ).origin;

  const messengerSnippet = slug ? `<script>
  window.BlawbyWidget = {
    baseUrl: ${JSON.stringify(widgetBaseUrl)},
    practiceSlug: ${JSON.stringify(slug)},
    pushDataLayerOnLeadSubmit: true,
    leadSubmitEventName: "blawby_lead_submitted",
    pushDataLayerOnChatStart: false,
    dataLayerEventName: "blawby_chat_start",
  };
</script>
<script src="${widgetLoaderSrc}" defer></script>` : undefined;

  const trackingSnippet = `window.addEventListener('blawby:widget-event', (event) => {
  const detail = event?.detail || {};

  if (detail.type === 'lead_submitted') {
    // Fire your conversion pixel(s) here.
    // Example:
    // gtag('event', 'generate_lead', { value: 1, currency: 'USD' });
    // fbq('track', 'Lead');
    console.log('Blawby lead submitted', detail);
  }
});`;

  const withCopyFeedback = async (
    value: string,
    setCopied: (next: boolean) => void
  ) => {
    try {
      await copyToClipboardWithFallback(value);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
      showSuccess(t('settings:apps.copySnippetSuccess.title'), t('settings:apps.copySnippetSuccess.body'));
    } catch (err) {
      console.error('Failed to copy snippet:', err);
      showError(t('settings:apps.copySnippetError.title'), t('settings:apps.copySnippetError.body'));
    }
  };

  const copySnippet = () => {
    if (!messengerSnippet) return;
    void withCopyFeedback(messengerSnippet, setCopiedScript);
  };

  const copyTrackingSnippet = () => {
    void withCopyFeedback(trackingSnippet, setCopiedTrackingScript);
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

  const { navigate } = useNavigation();
  const handleOpenSettings = () => {
    if (app.id === 'blawby-messenger') {
      navigate(buildSettingsPath(settingsBasePath, 'apps/blawby-messenger/settings'));
    } else {
      window.open(app.website, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <SettingsPage
      title={app.name}
      showBack
      onBack={onBack}
      contentMaxWidth={null}
    >
      <div className="space-y-6">
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
                  <Icon icon={PuzzlePieceIcon} className="w-8 h-8 text-input-text/80" aria-hidden="true"  />
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
                    ? t('settings:apps.enabled')
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
                  icon={EllipsisVerticalIcon} iconClassName="w-5 h-5"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={handleOpenSettings}>
                  <div className="flex items-center gap-2">
                    <Icon icon={Cog6ToothIcon} className="w-4 h-4" aria-hidden="true"  />
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
          <SettingSection title={t('settings:apps.messenger.integrationGuide.title')} className="py-6">
            <div className="space-y-4">
              <p className="text-sm text-secondary leading-relaxed">
                Install Website Messenger on every page where you want chat available.
              </p>
              <p className="text-sm text-secondary leading-relaxed">
                1. Paste this script as high as possible in your <code>&lt;head&gt;</code> (preferred), or before <code>&lt;/body&gt;</code>.
              </p>

              <div className="relative group">
                <pre className={`bg-elevation-2 rounded-lg p-4 text-sm font-mono text-accent-100 overflow-x-auto border border-line-glass/30 ${!slug ? 'opacity-50 grayscale' : ''}`}>
                  {slug ? messengerSnippet : t('settings:apps.messenger.placeholder')}
                </pre>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!slug}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity bg-elevation-3 hover:bg-elevation-4 border-line-glass/30"
                  icon={copiedScript ? <Icon icon={CheckIcon} className="w-4 h-4 text-accent-success"  /> : <Icon icon={DocumentDuplicateIcon} className="w-4 h-4"  />}
                  onClick={copySnippet}
                >
                  {copiedScript ? t('settings:apps.copied') : t('settings:apps.copy')}
                </Button>
                {!slug && (
                  <div className="absolute inset-0 flex items-center justify-center bg-elevation-1/40 backdrop-blur-[1px] rounded-lg">
                    <span className="text-xs font-medium text-secondary bg-elevation-3 px-3 py-1.5 rounded-full border border-line-glass/20 shadow-xl">
                      {t('settings:apps.messenger.missingSlugWarning')}
                    </span>
                  </div>
                )}
              </div>

              <p className="text-sm text-secondary leading-relaxed">
                2. Publish your site and verify the launcher appears on page load.
              </p>
              <p className="text-sm text-secondary leading-relaxed">
                3. Optional: add this listener snippet if you want to fire your own conversion pixels when a lead is submitted.
              </p>

              <div className="relative group">
                <pre className="bg-elevation-2 rounded-lg p-4 text-sm font-mono text-accent-100 overflow-x-auto border border-line-glass/30">
                  {trackingSnippet}
                </pre>
                <Button
                  variant="secondary"
                  size="sm"
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity bg-elevation-3 hover:bg-elevation-4 border-line-glass/30"
                  icon={copiedTrackingScript ? <Icon icon={CheckIcon} className="w-4 h-4 text-accent-success"  /> : <Icon icon={DocumentDuplicateIcon} className="w-4 h-4"  />}
                  onClick={copyTrackingSnippet}
                >
                  {copiedTrackingScript ? t('settings:apps.copied') : t('settings:apps.copy')}
                </Button>
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
                <Icon icon={GlobeAltIcon} className="w-4 h-4" aria-hidden="true"  />
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
                <Icon icon={GlobeAltIcon} className="w-4 h-4" aria-hidden="true"  />
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

      <AppConnectionDialog
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        app={app}
        onConnect={handleConnect}
      />
    </div>
    </SettingsPage>
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
