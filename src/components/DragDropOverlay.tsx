import { FunctionComponent } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { CloudArrowUpIcon } from "@heroicons/react/24/outline";

interface DragDropOverlayProps {
  isVisible: boolean;
  onClose?: () => void;
}

const DragDropOverlay: FunctionComponent<DragDropOverlayProps> = ({ isVisible, onClose }) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && overlayRef.current) {
      overlayRef.current.focus();
    }
  }, [isVisible]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && onClose) {
      onClose();
    }
  };

  useEffect(() => {
    if (isVisible) {
      if (typeof document !== 'undefined') {
        document.addEventListener('keydown', handleKeyDown);
      }
      return () => {
        if (typeof document !== 'undefined') {
          document.removeEventListener('keydown', handleKeyDown);
        }
      };
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  return (
    <div 
      ref={overlayRef}
      tabIndex={-1}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-white/85 to-white/95 dark:from-dark-bg/85 dark:to-dark-bg/95 backdrop-blur-sm" 
      role="dialog"
      aria-label="File upload"
      aria-modal="true"
    >
      <div className="flex flex-col items-center justify-center gap-3 text-gray-900 dark:text-white text-lg sm:text-xl lg:text-2xl text-center p-6 sm:p-10 rounded-2xl bg-white/80 dark:bg-dark-bg/80 shadow-2xl border border-gray-200 dark:border-dark-border max-w-[90%] relative z-[10000]">
        <CloudArrowUpIcon className="w-10 h-10 sm:w-14 sm:h-14 text-amber-500 mb-1" aria-hidden="true" />
        <h3 className="text-lg sm:text-2xl lg:text-3xl font-semibold m-0 text-gray-900 dark:text-white">Drop Files to Upload</h3>
        <p className="text-xs sm:text-sm lg:text-base opacity-80 m-0 text-gray-600 dark:text-gray-300">We accept images, videos, and document files</p>
      </div>
    </div>
  );
};

export default DragDropOverlay; 