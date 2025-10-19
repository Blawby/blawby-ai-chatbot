import { FunctionComponent } from 'preact';
import { useRef, useEffect, useState, useCallback, useLayoutEffect, useMemo } from 'preact/hooks';
import Message from './Message';
import OrganizationProfile from './OrganizationProfile';
import { memo } from 'preact/compat';
import { debounce } from '../utils/debounce';
import { ErrorBoundary } from './ErrorBoundary';
import { ChatMessageUI } from '../../worker/types';
import { ContactData } from './ContactForm';

interface VirtualMessageListProps {
    messages: ChatMessageUI[];
    organizationConfig?: {
        name: string;
        profileImage: string | null;
        organizationId: string;
        description?: string | null;
    };
    onOpenSidebar?: () => void;
    onContactFormSubmit?: (data: ContactData) => void;

    // Feedback props
    sessionId?: string;
    organizationId?: string;
    onFeedbackSubmit?: (feedback: unknown) => void;
}

const BATCH_SIZE = 20;
const SCROLL_THRESHOLD = 100;
const DEBOUNCE_DELAY = 50;

const VirtualMessageList: FunctionComponent<VirtualMessageListProps> = ({
    messages,
    organizationConfig,
    onOpenSidebar,
    onContactFormSubmit,
    sessionId,
    organizationId,
    onFeedbackSubmit
}) => {
    const listRef = useRef<HTMLDivElement>(null);
    const [startIndex, setStartIndex] = useState(Math.max(0, messages.length - BATCH_SIZE));
    const [endIndex, setEndIndex] = useState(messages.length);
    const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);

    const checkIfScrolledToBottom = useCallback((element: HTMLElement) => {
        const { scrollTop, scrollHeight, clientHeight } = element;
        return Math.abs(scrollHeight - scrollTop - clientHeight) < 10;
    }, []);

    const handleScroll = useCallback(() => {
        if (!listRef.current) return;

        const element = listRef.current;
        const isBottom = checkIfScrolledToBottom(element);
        setIsScrolledToBottom(isBottom);

        // Dispatch scroll event for navbar visibility
        const currentScrollTop = element.scrollTop;
        const lastScrollTop = (element as HTMLElement & { lastScrollTop?: number }).lastScrollTop || 0;
        const scrollDelta = Math.abs(currentScrollTop - lastScrollTop);
        
        if (scrollDelta > 0) {
            window.dispatchEvent(new CustomEvent('chat-scroll', {
                detail: { scrollTop: currentScrollTop, scrollDelta }
            }));
        }
        
        (element as HTMLElement & { lastScrollTop?: number }).lastScrollTop = currentScrollTop;

        // Load more messages when scrolling up
        if (element.scrollTop < SCROLL_THRESHOLD && startIndex > 0) {
            const newStartIndex = Math.max(0, startIndex - BATCH_SIZE);
            setStartIndex(newStartIndex);

            // Maintain scroll position when loading more messages
            requestAnimationFrame(() => {
                if (listRef.current) {
                    const newScrollTop = listRef.current.scrollHeight - element.scrollHeight;
                    if (newScrollTop > 0) {
                        listRef.current.scrollTop = newScrollTop;
                    }
                }
            });
        }
    }, [startIndex, checkIfScrolledToBottom]);

    const debouncedHandleScroll = useMemo(() => {
        return debounce(handleScroll, DEBOUNCE_DELAY);
    }, [handleScroll]);

    useEffect(() => {
        const list = listRef.current;
        if (list) {
            list.addEventListener('scroll', debouncedHandleScroll, { passive: true });
        }
        return () => {
            if (list) {
                list.removeEventListener('scroll', debouncedHandleScroll);
            }
            // Cancel any pending debounced calls to prevent delayed state updates after unmount
            debouncedHandleScroll.cancel();
        };
    }, [debouncedHandleScroll]);

    // Compute last message's isUser property to ensure effects re-run when it changes
    const lastIsUser = useMemo(() => {
        return messages[messages.length - 1]?.isUser;
    }, [messages]);

    useEffect(() => {
        // Update indices when new messages are added
        if (isScrolledToBottom || lastIsUser) {
            setEndIndex(messages.length);
            setStartIndex(Math.max(0, messages.length - BATCH_SIZE));
        }
    }, [messages.length, isScrolledToBottom, lastIsUser]);

    useLayoutEffect(() => {
        // Scroll to bottom when new messages are added and we're at the bottom
        // Also scroll when new messages are added (for button clicks, etc.)
        if (listRef.current && (isScrolledToBottom || lastIsUser)) {
            listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'auto' });
        }
    }, [messages, endIndex, isScrolledToBottom, lastIsUser]);


    const visibleMessages = messages.slice(startIndex, endIndex);

    return (
        <div
            className="flex-1 overflow-y-auto p-4 pt-16 lg:pt-4 pb-20 scroll-smooth w-full scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600"
            ref={listRef}
        >
            {/* Organization Profile Header - Fixed at top of scrollable area */}
            {organizationConfig && (
                <div className="flex flex-col items-center py-8 px-4 pb-6 border-b border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg mb-4">
                    <OrganizationProfile
                        name={organizationConfig.name}
                        profileImage={organizationConfig.profileImage}
                        organizationId={organizationId}
                        description={organizationConfig.description}
                        variant="welcome"
                        showVerified={true}
                    />
                </div>
            )}

            {startIndex > 0 && (
                <div className="flex justify-center items-center py-4">
                    <div className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm lg:text-base">Loading more messages...</div>
                </div>
            )}
            <ErrorBoundary>
                {visibleMessages.map((message, _index) => (
                    <Message
                        key={message.id}
                        content={message.content}
                        isUser={message.isUser}
                        files={message.files}
                        matterCanvas={message.matterCanvas}
                        paymentEmbed={message.paymentEmbed}
                        contactForm={message.contactForm}
                        generatedPDF={message.generatedPDF}
                        organizationConfig={organizationConfig}
                        onOpenSidebar={onOpenSidebar}
                        onContactFormSubmit={onContactFormSubmit}
                        isLoading={message.isLoading}
                        aiState={message.aiState}
                        toolMessage={message.toolMessage}
                        id={message.id}
                        sessionId={sessionId}
                        organizationId={organizationId}
                        onFeedbackSubmit={onFeedbackSubmit}
                    />
                ))}
            </ErrorBoundary>
        </div>
    );
};

export default memo(VirtualMessageList); 
