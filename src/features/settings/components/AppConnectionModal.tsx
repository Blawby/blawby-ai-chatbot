import { FunctionComponent } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import Modal from '@/shared/components/Modal';
import { Button } from '@/shared/ui/Button';
import { XMarkIcon, ShieldCheckIcon, LockClosedIcon, ExclamationTriangleIcon, PuzzlePieceIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/shared/i18n/hooks';
import type { App } from '../pages/appsData';
import { SectionDivider } from '@/shared/ui/layout';
import { SettingRow } from '@/features/settings/components/SettingRow';

interface AppConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  app: App;
  onConnect: () => void;
}

export const AppConnectionModal: FunctionComponent<AppConnectionModalProps> = ({
  isOpen,
  onClose,
  app,
  onConnect
}) => {
  const { t } = useTranslation(['settings']);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = `app-connection-title-${app.id}`;

  useEffect(() => {
    if (!isOpen) return;

    const container = dialogRef.current;
    if (!container) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const focusableElements = Array.from(
        container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute('aria-hidden'));
  
      if (focusableElements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
  
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;
  
      if (event.shiftKey) {
        if (activeElement === first || activeElement === container) {
          event.preventDefault();
          last.focus();
        }
      } else if (activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      previouslyFocusedRef.current?.focus();
      return;
    }

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      type="modal"
      showCloseButton={false}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex flex-col h-full max-h-[90vh] w-full max-w-md mx-auto bg-white dark:bg-dark-bg"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-dark-bg flex items-center justify-center">
              <PuzzlePieceIcon className="w-6 h-6 text-gray-700 dark:text-gray-200" aria-hidden="true" />
            </div>
            <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('settings:apps.clio.connectModal.title', { app: app.name })}
            </h2>
          </div>
          <Button
            variant="icon"
            size="icon"
            onClick={onClose}
            ref={closeButtonRef}
            aria-label="Close"
            icon={<XMarkIcon className="w-5 h-5" />}
          />
        </div>
        <SectionDivider />

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-2">
          <SettingRow
            label={t('settings:apps.clio.connectModal.permissions.title')}
            labelNode={(
              <div className="flex items-center gap-2">
                <ShieldCheckIcon className="w-5 h-5 text-gray-700 dark:text-gray-300" aria-hidden="true" />
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {t('settings:apps.clio.connectModal.permissions.title')}
                </span>
              </div>
            )}
            description={t('settings:apps.clio.connectModal.permissions.description', { app: app.name })}
          />

          <SectionDivider />

          <SettingRow
            label={t('settings:apps.clio.connectModal.control.title')}
            labelNode={(
              <div className="flex items-center gap-2">
                <LockClosedIcon className="w-5 h-5 text-gray-700 dark:text-gray-300" aria-hidden="true" />
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {t('settings:apps.clio.connectModal.control.title')}
                </span>
              </div>
            )}
            description={(
              <>
                {t('settings:apps.clio.connectModal.control.description', { app: app.name })}{' '}
                <a
                  href={app.privacyPolicy}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-600 dark:text-accent-400 hover:underline"
                >
                  {t('settings:apps.clio.connectModal.control.learnMore')}
                </a>
              </>
            )}
          />

          <SectionDivider />

          <SettingRow
            label={t('settings:apps.clio.connectModal.risk.title')}
            labelNode={(
              <div className="flex items-center gap-2">
                <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {t('settings:apps.clio.connectModal.risk.title')}
                </span>
              </div>
            )}
            description={(
              <>
                {t('settings:apps.clio.connectModal.risk.description')}{' '}
                <button
                  type="button"
                  onClick={() => {
                    // TODO: Link to security guide
                  }}
                  className="text-accent-600 dark:text-accent-400 hover:underline bg-transparent p-0 font-medium"
                >
                  {t('settings:apps.clio.connectModal.risk.learnMore')}
                </button>
              </>
            )}
          />
        </div>

        {/* Footer */}
        <SectionDivider />
        <div className="px-6 py-4">
          <Button
            variant="primary"
            size="lg"
            onClick={onConnect}
            className="w-full"
          >
            {t('settings:apps.clio.connectModal.continue', { app: app.name })}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
