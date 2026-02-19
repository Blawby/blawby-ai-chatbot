import { FunctionComponent } from 'preact';
import { CameraIcon } from '@heroicons/react/24/outline';

interface CameraCaptureButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

const CameraCaptureButton: FunctionComponent<CameraCaptureButtonProps> = ({ onClick, disabled, className }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Take photo"
      className={`cursor-pointer flex items-center justify-center transition-all duration-200 w-20 h-20 rounded-full glass-panel p-0 relative disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-surface-base ${className || ''}`}
      aria-label="Take photo"
    >
      <CameraIcon className="w-16 h-16 text-input-text" />
    </button>
  );
};

export default CameraCaptureButton;
