import { Button } from '../../ui/Button';
import { useNavigation } from '../../../utils/navigation';

export interface MFAEnrollmentPageProps {
  className?: string;
}

export const MFAEnrollmentPage = ({ className = '' }: MFAEnrollmentPageProps) => {
  const { navigate } = useNavigation();

  return (
    <div className={`min-h-screen bg-white dark:bg-dark-bg flex flex-col items-center justify-center px-6 ${className}`}>
      <div className="max-w-md text-center space-y-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Multi-factor authentication
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          MFA is not available yet. We&apos;re working on bringing stronger account security to Blawby.
          We&apos;ll notify you as soon as enrollment opens up.
        </p>
        <Button onClick={() => navigate('/app/settings/security')} className="w-full">
          Back to Security settings
        </Button>
      </div>
    </div>
  );
};
