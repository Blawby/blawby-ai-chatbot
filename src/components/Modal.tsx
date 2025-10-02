import { FunctionComponent } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { XMarkIcon } from "@heroicons/react/24/outline";
import { motion, AnimatePresence } from 'framer-motion';
import { THEME } from '../utils/constants';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    children: preact.ComponentChildren;
    title?: string;
    type?: 'modal' | 'drawer' | 'fullscreen';
    showCloseButton?: boolean;
    mobileBehavior?: 'modal' | 'drawer';
    disableBackdropClick?: boolean;
}

const Modal: FunctionComponent<ModalProps> = ({ 
    isOpen, 
    onClose, 
    children, 
    title, 
    type = 'modal',
    showCloseButton = true,
    mobileBehavior = 'drawer',
    disableBackdropClick = false
}) => {
    // Add state to track if we're in browser environment
    const [isBrowser, setIsBrowser] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    // Set browser state on mount and detect mobile
    useEffect(() => {
        setIsBrowser(true);
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => {
        // Only run in browser environment
        if (!isBrowser) return;

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose, isBrowser]);

    // Return null during SSR or when closed
    if (!isOpen || !isBrowser) return null;

    // Determine modal behavior based on type and mobile state
    const shouldUseDrawer = type === 'drawer' || (mobileBehavior === 'drawer' && isMobile);
    const shouldUseFullscreen = type === 'fullscreen';

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    className={`fixed inset-0 ${shouldUseDrawer ? '' : 'flex items-center justify-center p-4'}`}
                    style={{ zIndex: THEME.zIndex.modal }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    key="modal"
                >
                    {/* Backdrop */}
                    <div 
                        className="absolute inset-0 bg-black bg-opacity-50"
                        onClick={disableBackdropClick ? undefined : onClose}
                    />
                    
                    {/* Content */}
                    <motion.div 
                        className={`shadow-2xl overflow-hidden bg-white dark:bg-dark-bg text-gray-900 dark:text-white border border-gray-200 dark:border-dark-border ${
                            shouldUseDrawer 
                                ? 'fixed bottom-0 left-0 right-0 rounded-t-2xl max-h-[90vh]' 
                                : shouldUseFullscreen
                                ? 'fixed inset-0 w-full h-full'
                                : 'relative rounded-xl max-w-4xl w-full max-h-[90vh]'
                        }`}
                        initial={shouldUseDrawer ? { y: "100%" } : { scale: 0.95 }}
                        animate={shouldUseDrawer ? { y: 0 } : { scale: 1 }}
                        exit={shouldUseDrawer ? { y: "100%" } : { scale: 0.95 }}
                        transition={shouldUseDrawer ? { 
                            type: "tween", 
                            duration: 0.3, 
                            ease: [0.25, 0.46, 0.45, 0.94] 
                        } : { 
                            type: "spring" 
                        }}
                        key={`content-${shouldUseDrawer}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Handle for mobile drawer */}
                        {shouldUseDrawer && (
                            <div className="flex justify-center pt-4 pb-2">
                                <div className="w-12 h-1 rounded-full bg-gray-300 dark:bg-gray-600"></div>
                            </div>
                        )}
                        
                        {/* Header */}
                        {(title || showCloseButton) && !shouldUseFullscreen && (
                            <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg">
                                {title && <h3 className="text-base sm:text-lg lg:text-xl font-semibold m-0 text-gray-900 dark:text-white">{title}</h3>}
                                {showCloseButton && (
                                    <button
                                        onClick={onClose}
                                        className="p-1 rounded-md transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-dark-hover"
                                        aria-label="Close modal"
                                    >
                                        <XMarkIcon className="w-6 h-6" />
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Fullscreen close button */}
                        {shouldUseFullscreen && showCloseButton && (
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 w-10 h-10 border-none bg-black bg-opacity-50 text-white rounded-full cursor-pointer flex items-center justify-center transition-all duration-200 hover:bg-black hover:bg-opacity-70 hover:scale-110 z-10"
                                aria-label="Close modal"
                            >
                                <XMarkIcon className="w-6 h-6" />
                            </button>
                        )}
                        
                        {/* Content */}
                        <div className={`${shouldUseFullscreen ? 'h-full' : 'p-4'}`}>
                            {children}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return createPortal(modalContent, document.body);
};

export default Modal; 