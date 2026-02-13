// import { h } from 'preact'; // Unused
import { Button } from '@/shared/ui/Button';
import { useTranslation } from '@/shared/i18n/hooks';
import { useNavigation } from '@/shared/utils/navigation';

interface PracticeNotFoundProps {
  practiceId: string;
  onRetry?: () => void;
}

export function PracticeNotFound({ practiceId, onRetry }: PracticeNotFoundProps) {
  const { t } = useTranslation('practice');
  const { navigate } = useNavigation();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-transparent backdrop-blur-sm">
      <div className="text-center max-w-lg p-6 sm:p-8 md:p-12 glass-card">
        <h1 className="mb-6 text-3xl sm:text-4xl font-bold text-input-text">
          {t('notFound.title')}
        </h1>
        <p className="mb-10 text-base sm:text-lg leading-relaxed text-input-placeholder">
          {t('notFound.description.prefix')} &quot;<strong className="font-semibold text-input-text">{practiceId}</strong>&quot;. {t('notFound.description.suffix')}
        </p>
        <ul className="mb-10 text-left text-sm sm:text-base leading-relaxed text-input-placeholder">
          <li className="mb-2">• {t('notFound.reasons.incorrectId')}</li>
          <li className="mb-2">• {t('notFound.reasons.movedOrRemoved')}</li>
          <li className="mb-2">• {t('notFound.reasons.outdatedLink')}</li>
        </ul>
        <p className="mb-8 text-sm sm:text-base text-input-placeholder">
          {t('notFound.helpText.prefix')}{' '}
          <a href="https://blawby.com/help" target="_blank" rel="noopener noreferrer" className="text-accent-500 hover:underline">
            {t('notFound.helpLink')}
          </a>
          {' '}{t('notFound.helpText.middle')}{' '}
          <a href="https://github.com/Blawby" target="_blank" rel="noopener noreferrer" className="text-accent-500 hover:underline">
            {t('notFound.githubLink')}
          </a>
          {' '}{t('notFound.helpText.suffix')}
        </p>
        <div className="flex gap-3 sm:gap-4 justify-center flex-wrap">
          {onRetry && (
            <Button onClick={onRetry} variant="primary">
              {t('notFound.actions.tryAgain')}
            </Button>
          )}
          <Button 
            variant="secondary"
            onClick={() => navigate('/', true)}
          >
            {t('notFound.actions.goToHome')}
          </Button>
        </div>
      </div>
    </div>
  );
}
