import { useState } from 'preact/hooks';
import { ComponentChildren } from 'preact';
import { App, mockConnectApp, mockDisconnectApp } from './appsData';
import { SettingHeader } from '@/features/settings/components/SettingHeader';
import { Button } from '@/shared/ui/Button';
import { SectionDivider } from '@/shared/ui/layout';
import { ArrowLeftIcon, EllipsisVerticalIcon, GlobeAltIcon, LockClosedIcon, CheckBadgeIcon, PuzzlePieceIcon } from '@heroicons/react/24/outline';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useTranslation } from '@/shared/i18n/hooks';
import Modal from '@/shared/components/Modal';
import { formatDate } from '@/shared/utils/dateTime';
import { cn } from '@/shared/utils/cn';

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
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const handleConnect = async () => {
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
      setShowDisconnectConfirm(false);
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

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
          aria-label={t('settings:navigation.backToSettings')}
        >
          <ArrowLeftIcon className="w-5 h-5" aria-hidden="true" />
        </button>
        <div className="flex-1" />
      </div>

      <SettingHeader title={app.name} />

      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
        {/* Header card */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <PuzzlePieceIcon className="w-7 h-7 text-gray-700 dark:text-gray-200" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{app.name}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">{app.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {app.connected && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDisconnectConfirm(true)}
                disabled={isDisconnecting}
              >
                {isDisconnecting ? t('common:actions.loading') : t('settings:apps.clio.disconnect')}
              </Button>
            )}
            <Button
              variant={app.connected ? 'secondary' : 'primary'}
              size="sm"
              onClick={app.connected ? () => setShowDisconnectConfirm(true) : handleConnect}
              disabled={isConnecting || isDisconnecting}
            >
              {isConnecting
                ? t('common:actions.loading')
                : app.connected
                  ? t('settings:apps.clio.disconnect')
                  : t('settings:apps.clio.connect')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="More options"
              icon={<EllipsisVerticalIcon className="w-5 h-5" />}
            />
          </div>
        </div>

        <SectionDivider />

        {/* Information */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <LockClosedIcon className={cn('w-5 h-5', app.connected ? 'text-green-600' : 'text-gray-400')} aria-hidden="true" />
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {app.connected ? t('settings:apps.clio.connected') : t('settings:apps.clio.notConnected')}
            </p>
            {app.connected && app.connectedAt && (
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {`${t('settings:apps.clio.connectedOn')} ${formatDate(app.connectedAt)}`}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow label={t('settings:apps.clio.category')} value={app.category} />
            <InfoRow label={t('settings:apps.clio.developer')} value={app.developer} />
            <InfoRow
              label={t('settings:apps.clio.website')}
              value={
                <a
                  href={app.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-accent-600 hover:text-accent-700"
                >
                  {app.website}
                  <GlobeAltIcon className="w-4 h-4" aria-hidden="true" />
                </a>
              }
            />
            <InfoRow
              label={t('settings:apps.clio.privacyPolicy')}
              value={
                <a
                  href={app.privacyPolicy}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-accent-600 hover:text-accent-700"
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
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <CheckBadgeIcon className="w-5 h-5" aria-hidden="true" />
              {t('settings:apps.clio.actions')}
            </h3>
            <ul className="space-y-2">
              {app.actions.map((action) => (
                <li key={action} className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-500" aria-hidden="true" />
                  {action}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <Modal
        isOpen={showDisconnectConfirm}
        onClose={() => setShowDisconnectConfirm(false)}
        title={t('settings:apps.clio.disconnectConfirm.title')}
        disableBackdropClick={isDisconnecting}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {t('settings:apps.clio.disconnectConfirm.message')}
          </p>

          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowDisconnectConfirm(false)}
              disabled={isDisconnecting}
            >
              {t('settings:apps.clio.disconnectConfirm.cancel')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? t('common:actions.loading') : t('settings:apps.clio.disconnectConfirm.confirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

interface InfoRowProps {
  label: string;
  value: string | ComponentChildren;
}

const InfoRow = ({ label, value }: InfoRowProps) => {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <div className="text-sm text-gray-900 dark:text-gray-100 mt-1 break-all">
        {value}
      </div>
    </div>
  );
};
