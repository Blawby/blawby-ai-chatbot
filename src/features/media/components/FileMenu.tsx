import { FunctionComponent } from 'preact';
import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import { Plus, Image, Camera, X } from 'lucide-preact';

import { Icon } from '@/shared/ui/Icon';
import { Button } from '@/shared/ui/Button';
import CameraDialog from '@/features/modals/components/CameraDialog';
import { THEME } from '@/shared/utils/constants';

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
  const [showCameraDialog, setShowCameraDialog] = useState(false);
  const [isBrowser, setIsBrowser] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setIsBrowser(true), []);

  const handleClose = useCallback(() => {
    if (isOpen && !isClosing) {
      setIsClosing(true);
      setTimeout(() => { setIsOpen(false); setIsClosing(false); }, 150);
    }
  }, [isOpen, isClosing]);

  const handleClickOutside = useCallback((e: Event) => {
    const target = e.target as Node;
    if (menuRef.current && !menuRef.current.contains(target)) {
      handleClose();
    }
  }, [handleClose]);

  const handleFileClick = () => {
    // Batch file input click and menu close operations
    fileInputRef.current?.click();
    handleClose();
  };

  const preventPointerFocus = (event: MouseEvent) => {
    event.preventDefault();
  };

  useEffect(() => {
    if (!isBrowser) return;

    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isOpen, isBrowser, handleClickOutside]);

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
  }, [isOpen, isBrowser, handleClose]);

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
    setShowCameraDialog(true); 
    handleClose(); 
  };
  
  const handleCapture = (file: File) => { 
    onCameraCapture(file); 
    setShowCameraDialog(false); 
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
        size="icon-sm"
        ref={triggerRef}
        disabled={!isReadyToUpload}
        onClick={() => isReadyToUpload && setIsOpen(!isOpen)}
        title={isReadyToUpload ? 'Add attachment' : 'File upload not ready yet'}
        aria-label="Open file attachment menu"
        id="attachment-menu-button"
        aria-haspopup="menu"
        aria-controls="attachment-menu"
        aria-expanded={isOpen}
        className={`shadow-lg border disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-line-glass/30 focus-visible:ring-offset-0 active:scale-100 ${
          isOpen
            ? 'bg-surface-utility/20 border-line-glass/35'
            : 'bg-surface-utility/10 border-line-glass/20 hover:bg-surface-utility/20 hover:border-line-glass/30 hover:scale-105'
        }`}
        icon={Plus} iconClassName="w-5 h-5"
      />

      {(isOpen || isClosing) && (
        <div
          id="attachment-menu"
          role="menu"
          aria-labelledby="attachment-menu-button"
          className={`
            absolute bottom-full left-0 mb-2 min-w-[220px]
            p-1 rounded-xl border border-line-glass/30 bg-surface-overlay/95 backdrop-blur-2xl shadow-glass transition-all duration-200
            ${isClosing ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}
          `}
          style={{ zIndex: THEME.zIndex.fileMenu }}
        >
          <Button
            type="button"
            variant="menu-item"
            role="menuitem"
            onClick={handleFileClick}
            onMouseDown={preventPointerFocus}
            className="file-menu-item py-3 text-xs sm:text-sm"
          >
            <span>Add photos &amp; files</span>
            <Icon icon={Image} className="w-5 h-5" aria-hidden="true"  />
          </Button>

          <Button
            type="button"
            variant="menu-item"
            role="menuitem"
            onClick={openCamera}
            onMouseDown={preventPointerFocus}
            className="file-menu-item py-3 border-t border-line-glass/10 text-xs sm:text-sm"
          >
            <span>Take Photo</span>
            <Icon icon={Camera} className="w-5 h-5" aria-hidden="true"  />
          </Button>
        </div>
      )}

      {/* Error notification (unchanged, tokenized) */}
      {errorMessage && (
        <div
          role="alert" aria-live="polite"
          className="absolute bottom-full left-0 mb-2 min-w-[250px] p-3 glass-card border-accent-error/30 bg-accent-error/10"
          style={{ zIndex: THEME.zIndex.fileMenu + 1 }}
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 text-sm text-accent-error-foreground">{errorMessage}</div>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 text-accent-error hover:text-accent-error-dark dark:text-accent-error-light dark:hover:text-accent-error-foreground transition-colors"
              aria-label="Dismiss error message"
            >
              <Icon icon={X} className="w-4 h-4"  />
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
        <CameraDialog
          isOpen={showCameraDialog}
          onClose={() => setShowCameraDialog(false)}
          onCapture={handleCapture}
        />
      )}
    </div>
  );
};

export default FileMenu;
