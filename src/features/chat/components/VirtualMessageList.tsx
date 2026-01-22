import { FunctionComponent } from 'preact';
import { useRef, useEffect, useState, useCallback, useLayoutEffect, useMemo } from 'preact/hooks';
import Message from './Message';
import PracticeProfile from '@/features/practice/components/PracticeProfile';
import { memo } from 'preact/compat';
import { debounce } from '@/shared/utils/debounce';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { ChatMessageUI } from '../../../../worker/types';
import { ContactData } from '@/features/intake/components/ContactForm';
import type { IntakePaymentRequest } from '@/shared/utils/intakePayments';
import { useSessionContext } from '@/shared/contexts/SessionContext';

interface VirtualMessageListProps {
    messages: ChatMessageUI[];
    practiceConfig?: {
        name: string;
        profileImage: string | null;
        practiceId: string;
        description?: string | null;
        slug?: string | null;
    };
    onOpenSidebar?: () => void;
    onContactFormSubmit?: (data: ContactData) => void;
    onOpenPayment?: (request: IntakePaymentRequest) => void;
    practiceId?: string;
    intakeStatus?: {
        step: string;
    };
    modeSelectorActions?: {
        onAskQuestion: () => void;
        onRequestConsultation: () => void;
    };
    hasMoreMessages?: boolean;
    isLoadingMoreMessages?: boolean;
    onLoadMoreMessages?: () => void | Promise<void>;
}

const BATCH_SIZE = 20;
const SCROLL_THRESHOLD = 100;
const DEBOUNCE_DELAY = 50;

const VirtualMessageList: FunctionComponent<VirtualMessageListProps> = ({
    messages,
    practiceConfig,
    onOpenSidebar,
    onContactFormSubmit,
    onOpenPayment,
    practiceId,
    intakeStatus: _intakeStatus,
    modeSelectorActions,
    hasMoreMessages,
    isLoadingMoreMessages,
    onLoadMoreMessages
}) => {
    const { session } = useSessionContext();
    const listRef = useRef<HTMLDivElement>(null);
    const [startIndex, setStartIndex] = useState(Math.max(0, messages.length - BATCH_SIZE));
    const [endIndex, setEndIndex] = useState(messages.length);
    const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);
    const isLoadingRef = useRef(false);
    const currentUserName = session?.user?.name || session?.user?.email || 'You';
    const currentUserAvatar = session?.user?.image ?? null;

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

        // Load more messages when scrolling up (client-side)
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
        if (
            element.scrollTop < SCROLL_THRESHOLD &&
            startIndex === 0 &&
            hasMoreMessages &&
            !isLoadingMoreMessages &&
            !isLoadingRef.current &&
            onLoadMoreMessages
        ) {
            isLoadingRef.current = true;
            const previousScrollHeight = element.scrollHeight;
            const previousScrollTop = element.scrollTop;
            void Promise.resolve(onLoadMoreMessages())
                .then(() => {
                    requestAnimationFrame(() => {
                        if (!listRef.current) return;
                        const newScrollHeight = listRef.current.scrollHeight;
                        const heightDiff = newScrollHeight - previousScrollHeight;
                        if (heightDiff > 0) {
                            listRef.current.scrollTop = previousScrollTop + heightDiff;
                        }
                    });
                })
                .catch((error) => {
                    console.error('[VirtualMessageList] Failed to load more messages', error);
                })
                .finally(() => {
                    isLoadingRef.current = false;
                });
        }
    }, [
        startIndex,
        checkIfScrolledToBottom,
        hasMoreMessages,
        isLoadingMoreMessages,
        onLoadMoreMessages
    ]);

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
            {/* Practice Profile Header - Fixed at top of scrollable area */}
            {practiceConfig && (
                <div className="flex flex-col items-center py-8 px-4 pb-6 border-b border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg mb-4">
                    <PracticeProfile
                        name={practiceConfig.name}
                        profileImage={practiceConfig.profileImage}
                        practiceSlug={practiceConfig.slug ?? practiceConfig.practiceId}
                        description={practiceConfig.description}
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
            {startIndex === 0 && hasMoreMessages && (
                <div className="flex justify-center items-center py-4">
                    <button
                        type="button"
                        className="text-xs sm:text-sm lg:text-base text-brand-purple hover:text-brand-purple-dark disabled:opacity-60"
                        onClick={() => onLoadMoreMessages?.()}
                        disabled={isLoadingMoreMessages}
                    >
                        {isLoadingMoreMessages ? 'Loading older messages...' : 'Load older messages'}
                    </button>
                </div>
            )}
            <ErrorBoundary>
                {visibleMessages.map((message, _index) => {
                    // Determine avatar for message
                    // Check if message has avatar in metadata (for mock data)
                    const mockAvatar = message.metadata?.avatar as { src?: string | null; name: string } | undefined;
                    const isBotNotification = message.role === 'system'
                        && typeof message.metadata?.notificationType === 'string';
                    
                    const avatar = mockAvatar
                        ? mockAvatar
                        : isBotNotification
                            ? {
                                src: '/blawby-favicon-iframe.png',
                                name: 'Blawby'
                            }
                            : message.isUser 
                                ? {
                                    src: currentUserAvatar,
                                    name: currentUserName
                                }
                                : practiceConfig 
                                    ? {
                                        src: practiceConfig.profileImage,
                                        name: practiceConfig.name
                                    }
                                    : undefined;

                    return (
                        <Message
                            key={message.id}
                            content={message.content}
                            isUser={message.isUser}
                            files={message.files}
                            avatar={avatar}
                            matterCanvas={message.matterCanvas}
                            contactForm={message.contactForm}
                            generatedPDF={message.generatedPDF}
                            paymentRequest={message.paymentRequest}
                            practiceConfig={practiceConfig}
                            onOpenSidebar={onOpenSidebar}
                            onContactFormSubmit={onContactFormSubmit}
                            onOpenPayment={onOpenPayment}
                            isLoading={message.isLoading}
                            // REMOVED: aiState - AI functionality removed
                            toolMessage={message.toolMessage}
                            id={message.id}
                            practiceId={practiceId}
                            assistantRetry={message.assistantRetry}
                            modeSelector={message.metadata?.modeSelector && modeSelectorActions
                                ? {
                                    onAskQuestion: modeSelectorActions.onAskQuestion,
                                    onRequestConsultation: modeSelectorActions.onRequestConsultation
                                }
                                : undefined}
                        />
                    );
                })}
            </ErrorBoundary>
        </div>
    );
};

export default memo(VirtualMessageList); 
