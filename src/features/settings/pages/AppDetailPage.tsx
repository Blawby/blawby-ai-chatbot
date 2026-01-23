import { useState } from 'preact/hooks';
import { ComponentChildren } from 'preact';
import { App, mockConnectApp, mockDisconnectApp } from './appsData';
import { AppConnectionModal } from '@/features/settings/components/AppConnectionModal';
import { Button } from '@/shared/ui/Button';
import { SectionDivider } from '@/shared/ui/layout';
import { ArrowLeftIcon, EllipsisVerticalIcon, GlobeAltIcon, PuzzlePieceIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
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
    window.open(app.website, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {/* Header */}
        <div className="pt-4 pb-6">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 mb-4 text-gray-600 dark:text-gray-300"
            aria-label={t('settings:navigation.backToSettings')}
          >
            <ArrowLeftIcon className="w-5 h-5" aria-hidden="true" />
            <span className="text-sm font-medium">{t('settings:navigation.back')}</span>
          </button>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center border border-gray-200 dark:border-dark-border overflow-hidden">
                {app.logo ? (
                  <img
                    src={app.logo}
                    alt={`${app.name} logo`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <PuzzlePieceIcon className="w-8 h-8 text-gray-700 dark:text-gray-200" aria-hidden="true" />
                )}
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{app.name}</h2>
              {isComingSoon && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                  {t('settings:apps.comingSoon')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={app.connected ? 'secondary' : 'primary'}
                size="sm"
                onClick={app.connected ? handleDisconnect : handleConnectClick}
                disabled={isConnecting || isDisconnecting || isComingSoon}
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
          </div>
        </div>

        <SectionDivider />

        {/* Information */}
        <div className="py-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {t('settings:apps.clio.information')}
          </h3>
          
          <div className="space-y-3">
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
          </div>
        </div>

        <SectionDivider />

        {/* Actions */}
        {app.actions && app.actions.length > 0 && (
          <div className="py-6 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {t('settings:apps.clio.actions')}
            </h3>
            <div className="space-y-6">
              {app.actions.map((action) => (
                <div key={action.name} className="space-y-2 w-full">
                  <code className="text-sm font-mono font-semibold text-gray-700 dark:text-gray-300 block w-full">
                    {action.name}
                  </code>
                  {action.hasMetadata && (
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-500 block w-full">
                      METADATA
                    </span>
                  )}
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-normal w-full">
                    {action.description}
                  </p>
                  {action.visibility && (
                    <div className="space-y-1 w-full">
                      <span className="text-sm text-gray-600 dark:text-gray-400 block font-normal w-full">Visibility</span>
                      <input
                        type="text"
                        value={action.visibility}
                        readOnly
                        className="text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-md px-2 py-1 font-normal w-full"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <AppConnectionModal
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        app={app}
        onConnect={handleConnect}
      />
    </div>
  );
};

interface InfoRowSimpleProps {
  label: string;
  value: string | ComponentChildren;
}

const InfoRowSimple = ({ label, value }: InfoRowSimpleProps) => {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
      <span className="text-sm text-gray-900 dark:text-gray-100 text-right break-all">
        {value}
      </span>
    </div>
  );
};
