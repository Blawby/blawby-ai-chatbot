import { FunctionComponent } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import { PlusIcon, PhotoIcon, CameraIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from './ui/Button';
import CameraModal from './CameraModal';
import { THEME } from '../utils/constants';

interface FileMenuProps {
  onFileSelect: (files: File[]) => void;
  onCameraCapture: (file: File) => void;
  isReadyToUpload?: boolean;
}

const FileMenu: FunctionComponent<FileMenuProps> = ({
  onFileSelect,
  onCameraCapture,
  isReadyToUpload = true
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [isBrowser, setIsBrowser] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstMenuItemRef = useRef<HTMLButtonElement>(null);
  const focusAnimationFrameRef = useRef<number | null>(null);

  useEffect(() => setIsBrowser(true), []);

  const handleClickOutside = (e: Event) => {
    const target = e.target as Node;
    if (menuRef.current && !menuRef.current.contains(target)) {
      handleClose();
    }
  };

  const handleClose = () => {
    if (isOpen && !isClosing) {
      setIsClosing(true);
      setTimeout(() => { setIsOpen(false); setIsClosing(false); }, 150);
    }
  };

  const handleFileClick = () => {
    // Batch file input click and menu close operations
    fileInputRef.current?.click();
    handleClose();
  };

  useEffect(() => {
    if (!isBrowser) return;

    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      
      // Replace setTimeout with requestAnimationFrame for more reliable focus scheduling
      focusAnimationFrameRef.current = requestAnimationFrame(() => {
        // Use a second requestAnimationFrame for extra reliability on slow devices
        focusAnimationFrameRef.current = requestAnimationFrame(() => {
          firstMenuItemRef.current?.focus?.();
        });
      });
    }
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
      // Clean up any scheduled animation frame if component unmounts
      if (focusAnimationFrameRef.current !== null) {
        cancelAnimationFrame(focusAnimationFrameRef.current);
        focusAnimationFrameRef.current = null;
      }
    };
  }, [isOpen, isBrowser]);

  // trap simple Tab focus within menu
  useEffect(() => {
    if (!isBrowser || !isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
        triggerRef.current?.focus();
      } else if (e.key === 'Tab') {
        const items = menuRef.current?.querySelectorAll('button.file-menu-item');
        if (!items?.length) return;
        const first = items[0] as HTMLButtonElement;
        const last = items[items.length - 1] as HTMLButtonElement;

        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, isBrowser]);

  const filterDisallowedFiles = (files: File[]) => {
    const disallowed = ['zip', 'exe', 'bat', 'cmd', 'msi', 'app'];
    return files.filter(f => {
      const lastDotIndex = f.name.lastIndexOf('.');
      if (lastDotIndex === -1 || lastDotIndex === f.name.length - 1) return true;
      const ext = f.name.slice(lastDotIndex + 1).toLowerCase();
      return !disallowed.includes(ext);
    });
  };

  const openCamera = () => { 
    setShowCameraModal(true); 
    handleClose(); 
  };
  
  const handleCapture = (file: File) => { 
    onCameraCapture(file); 
    setShowCameraModal(false); 
  };

  const onFileChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const all = Array.from(target.files || []);
    const safe = filterDisallowedFiles(all);
    
    // Batch file selection and error handling
    if (safe.length) onFileSelect(safe);
    if (safe.length !== all.length) {
      setErrorMessage('Some files were not uploaded. ZIP and executable files are not allowed.');
      setTimeout(() => setErrorMessage(null), 5000);
    }
    target.value = '';
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* CHATGPT-STYLE TRIGGER: 40px circular, matte, token colors */}
      <Button
        type="button"
        variant="icon"
        size="md"
        ref={triggerRef}
        disabled={!isReadyToUpload}
        onClick={() => isReadyToUpload && setIsOpen(!isOpen)}
        title={isReadyToUpload ? 'Add attachment' : 'File upload not ready yet'}
        aria-label="Open file attachment menu"
        id="attachment-menu-button"
        aria-haspopup="menu"
        aria-controls="attachment-menu"
        aria-expanded={isOpen}
        className="
          w-8 h-8 rounded-full shadow
          bg-light-message-bg-user border border-light-border text-light-text
          hover:bg-light-hover
          disabled:opacity-60 disabled:cursor-not-allowed
          dark:bg-dark-message-bg-user dark:border-dark-border dark:text-dark-text
          dark:hover:bg-dark-hover
        "
        icon={<PlusIcon className="w-4 h-4" aria-hidden="true" />}
      />

      {(isOpen || isClosing) && (
        <div
          id="attachment-menu"
          role="menu"
          aria-labelledby="attachment-menu-button"
          className={`
            absolute bottom-full left-0 mb-2 min-w-[220px]
            rounded-lg border p-1 shadow-lg transition-all duration-200
            bg-light-input-bg border-light-border
            dark:bg-dark-input-bg dark:border-dark-border
            ${isClosing ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}
          `}
          style={{ zIndex: THEME.zIndex.fileMenu }}
        >
          <Button
            type="button"
            variant="ghost"
            role="menuitem"
            ref={firstMenuItemRef}
            onClick={handleFileClick}
            className="
              file-menu-item w-full px-3 py-3 rounded flex items-center justify-between
              text-light-text hover:bg-light-hover
              dark:text-dark-text dark:hover:bg-dark-hover
              text-xs sm:text-sm
            "
          >
            <span>Add photos &amp; files</span>
            <PhotoIcon className="w-5 h-5" aria-hidden="true" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            role="menuitem"
            onClick={openCamera}
            className="
              file-menu-item w-full px-3 py-3 rounded flex items-center justify-between
              text-light-text hover:bg-light-hover
              dark:text-dark-text dark:hover:bg-dark-hover
              border-t border-light-border dark:border-dark-border
              text-xs sm:text-sm
            "
          >
            <span>Take Photo</span>
            <CameraIcon className="w-5 h-5" aria-hidden="true" />
          </Button>
        </div>
      )}

      {/* Error notification (unchanged, tokenized) */}
      {errorMessage && (
        <div
          role="alert" aria-live="polite"
          className="absolute bottom-full left-0 mb-2 min-w-[250px] rounded-lg p-3 shadow-lg
                     bg-red-50 border border-red-200 text-red-700
                     dark:bg-red-900/20 dark:border-red-800 dark:text-red-300"
          style={{ zIndex: THEME.zIndex.fileMenu + 1 }}
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 text-sm">{errorMessage}</div>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200 transition-colors"
              aria-label="Dismiss error message"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={onFileChange}
        multiple
        accept="image/*,video/*,audio/*,application/pdf,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        aria-hidden="true"
        tabIndex={-1}
      />

      {isBrowser && (
        <CameraModal
          isOpen={showCameraModal}
          onClose={() => setShowCameraModal(false)}
          onCapture={handleCapture}
        />
      )}
    </div>
  );
};

export default FileMenu;
