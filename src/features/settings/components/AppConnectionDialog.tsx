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
  const { t, i18n } = useTranslation(['settings']);
  const appKey = i18n.exists(`settings:apps.${app.id}.connectModal.title`) ? app.id : 'clio';
  const connectModalKey = `settings:apps.${appKey}.connectModal`;
  const items: InfoListDialogItem[] = [
    {
      id: 'permissions',
      icon: ShieldCheckIcon,
      title: t(`${connectModalKey}.permissions.title`),
      description: t(`${connectModalKey}.permissions.description`, { app: app.name }),
    },
    {
      id: 'control',
      icon: LockClosedIcon,
      title: t(`${connectModalKey}.control.title`),
      description: (
        <>
          {t(`${connectModalKey}.control.description`, { app: app.name })}{' '}
          <a
            href={app.privacyPolicy}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-600 hover:underline dark:text-accent-400"
          >
            {t(`${connectModalKey}.control.learnMore`)}
          </a>
        </>
      ),
    },
    {
      id: 'risk',
      icon: ExclamationTriangleIcon,
      iconClassName: 'h-5 w-5 text-[rgb(var(--warning-foreground))]',
      title: t(`${connectModalKey}.risk.title`),
      description: (
        <>
          {t(`${connectModalKey}.risk.description`)}{' '}
          <a
            href="https://blawby.com/help"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent-600 hover:underline dark:text-accent-400"
          >
            {t(`${connectModalKey}.risk.learnMore`)}
          </a>
        </>
      ),
    },
  ];

  return (
    <InfoListDialog
      isOpen={isOpen}
      onClose={onClose}
      title={t(`${connectModalKey}.title`, { app: app.name })}
      description={t(`${connectModalKey}.description`, { app: app.name })}
      headerIcon={PuzzlePieceIcon}
      items={items}
      actionLabel={t(`${connectModalKey}.continue`, { app: app.name })}
      onAction={onConnect}
    />
  );
};
