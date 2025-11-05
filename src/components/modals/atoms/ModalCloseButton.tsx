import { FunctionComponent } from 'preact';

interface ModalCloseButtonProps {
  onClick: () => void;
  ariaLabel?: string;
  className?: string;
}

const ModalCloseButton: FunctionComponent<ModalCloseButtonProps> = ({ onClick, ariaLabel = 'Close', className }) => {
  return (
    <button
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={`p-1 rounded-md transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${className || ''}`}
      aria-label={ariaLabel}
      type="button"
    >
      <svg className="w-5 h-5 text-gray-500" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
};

export default ModalCloseButton;
