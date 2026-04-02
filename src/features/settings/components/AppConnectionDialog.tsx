import { FunctionComponent } from 'preact';
import { InfoListDialog, type InfoListDialogItem } from '@/shared/ui/dialog';
import { ShieldCheckIcon, LockClosedIcon, ExclamationTriangleIcon, PuzzlePieceIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/shared/i18n/hooks';
import type { App } from '../pages/appsData';

interface AppConnectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  app: App;
  onConnect: () => void;
}

export const AppConnectionDialog: FunctionComponent<AppConnectionDialogProps> = ({
  isOpen,
  onClose,
  app,
  onConnect
}) => {
  const { t } = useTranslation(['settings']);
  const items: InfoListDialogItem[] = [
    {
      id: 'permissions',
      icon: ShieldCheckIcon,
      title: t('settings:apps.clio.connectModal.permissions.title'),
      description: t('settings:apps.clio.connectModal.permissions.description', { app: app.name }),
    },
    {
      id: 'control',
      icon: LockClosedIcon,
      title: t('settings:apps.clio.connectModal.control.title'),
      description: (
        <>
          {t('settings:apps.clio.connectModal.control.description', { app: app.name })}{' '}
          <a
            href={app.privacyPolicy}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-600 hover:underline dark:text-accent-400"
          >
            {t('settings:apps.clio.connectModal.control.learnMore')}
          </a>
        </>
      ),
    },
    {
      id: 'risk',
      icon: ExclamationTriangleIcon,
      iconClassName: 'h-5 w-5 text-amber-600 dark:text-amber-400',
      title: t('settings:apps.clio.connectModal.risk.title'),
      description: (
        <>
          {t('settings:apps.clio.connectModal.risk.description')}{' '}
          <button
            type="button"
            onClick={() => {
              // TODO: Link to security guide
            }}
            className="bg-transparent p-0 font-medium text-accent-600 hover:underline dark:text-accent-400"
          >
            {t('settings:apps.clio.connectModal.risk.learnMore')}
          </button>
        </>
      ),
    },
  ];

  return (
    <InfoListDialog
      isOpen={isOpen}
      onClose={onClose}
      title={t('settings:apps.clio.connectModal.title', { app: app.name })}
      description={t('settings:apps.clio.connectModal.description', { app: app.name })}
      headerIcon={PuzzlePieceIcon}
      items={items}
      actionLabel={t('settings:apps.clio.connectModal.continue', { app: app.name })}
      onAction={onConnect}
    />
  );
};
