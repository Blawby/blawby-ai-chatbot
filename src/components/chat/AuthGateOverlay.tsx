import { FunctionComponent } from 'preact';
import { Button } from '../ui/Button';

interface AuthGateOverlayProps {
  onSignIn: () => void;
  practiceName?: string;
}

/**
 * Overlay shown when anonymous user has completed intake and needs to sign in
 */
export const AuthGateOverlay: FunctionComponent<AuthGateOverlayProps> = ({
  onSignIn,
  practiceName
}) => {
  return (
    <div className="absolute inset-0 bg-white/95 dark:bg-dark-bg/95 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Save Your Conversation
        </h2>
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          Sign up to save your conversation and case details. We'll notify you when {practiceName || 'the practice'} responds.
        </p>
        <Button
          onClick={onSignIn}
          variant="primary"
          size="md"
          className="w-full"
        >
          Sign Up / Sign In
        </Button>
      </div>
    </div>
  );
};
