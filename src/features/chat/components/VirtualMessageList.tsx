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
import { useToastContext } from '@/shared/contexts/ToastContext';
import { postSystemMessage } from '@/shared/lib/conversationApi';
import type { MatterTransitionResult } from '@/shared/hooks/usePracticeManagement';
import type { ReplyTarget } from '@/features/chat/types';

interface VirtualMessageListProps {
    messages: ChatMessageUI[];
    conversationTitle?: string | null;
    practiceConfig?: {
        name: string;
        profileImage: string | null;
        practiceId: string;
        description?: string | null;
        slug?: string | null;
    };
    showPracticeHeader?: boolean;
    isPublicWorkspace?: boolean;
    onOpenSidebar?: () => void;
    onContactFormSubmit?: (data: ContactData) => void;
    onOpenPayment?: (request: IntakePaymentRequest) => void;
    contactFormVariant?: 'card' | 'plain';
    contactFormFormId?: string;
    showContactFormSubmit?: boolean;
    practiceId?: string;
    onReply?: (target: ReplyTarget) => void;
    onToggleReaction?: (messageId: string, emoji: string) => void;
    onRequestReactions?: (messageId: string) => void;
    intakeStatus?: {
        step: string;
    };
    modeSelectorActions?: {
        onAskQuestion: () => void;
        onRequestConsultation: () => void;
    };
    leadReviewActions?: {
        practiceId: string;
        practiceName: string;
        conversationId: string;
        canReviewLeads: boolean;
        acceptMatter: (practiceId: string, matterId: string) => Promise<MatterTransitionResult>;
        rejectMatter: (practiceId: string, matterId: string) => Promise<MatterTransitionResult>;
        onLeadStatusChange?: () => void;
    };
    hasMoreMessages?: boolean;
    isLoadingMoreMessages?: boolean;
    onLoadMoreMessages?: () => void | Promise<void>;
    showSkeleton?: boolean;
}

const BATCH_SIZE = 20;
const SCROLL_THRESHOLD = 100;
const DEBOUNCE_DELAY = 50;

const VirtualMessageList: FunctionComponent<VirtualMessageListProps> = ({
    messages,
    conversationTitle,
    practiceConfig,
    showPracticeHeader = true,
    isPublicWorkspace = false,
    onOpenSidebar,
    onContactFormSubmit,
    onOpenPayment,
    contactFormVariant,
    contactFormFormId,
    showContactFormSubmit,
    practiceId,
    onReply,
    onToggleReaction,
    onRequestReactions,
    intakeStatus: _intakeStatus,
    modeSelectorActions,
    leadReviewActions,
    hasMoreMessages,
    isLoadingMoreMessages,
    onLoadMoreMessages,
    showSkeleton = false
}) => {
    const { session, activeMemberRole } = useSessionContext();
    const { showError, showSuccess } = useToastContext();
    const dedupedMessages = useMemo(() => {
        const seenPaymentConfirm = new Set<string>();
        return messages.filter((message) => {
            const intakePaymentUuid = typeof message.metadata?.intakePaymentUuid === 'string'
                ? message.metadata.intakePaymentUuid
                : null;
            if (!intakePaymentUuid) {
                return true;
            }
            const key = `${intakePaymentUuid}:${message.role}`;
            if (seenPaymentConfirm.has(key)) {
                return false;
            }
            seenPaymentConfirm.add(key);
            return true;
        });
    }, [messages]);
    const listRef = useRef<HTMLDivElement>(null);
    const [startIndex, setStartIndex] = useState(Math.max(0, dedupedMessages.length - BATCH_SIZE));
    const [endIndex, setEndIndex] = useState(dedupedMessages.length);
    const isScrolledToBottomRef = useRef(true);
    const isUserScrollingRef = useRef(false);
    const isLoadingRef = useRef(false);
    const currentUserName = session?.user?.name || session?.user?.email || 'You';
    const currentUserAvatar = session?.user?.image || null;
    const currentUserProfile = {
        src: currentUserAvatar,
        name: currentUserName
    };
    const practiceProfile = practiceConfig ? {
        src: practiceConfig.profileImage,
        name: practiceConfig.name
    } : {
        src: null,
        name: 'Practice'
    };
    const clientProfile = {
        src: null,
        name: conversationTitle?.trim() || 'Client'
    };
    const blawbyProfile = {
        src: '/blawby-favicon-iframe.png',
        name: 'Blawby'
    };
    const isPracticeViewer = Boolean(activeMemberRole && activeMemberRole !== 'client');
    const [leadActionState, setLeadActionState] = useState<Record<string, 'accept' | 'reject'>>({});

    const resolveAvatar = (message: ChatMessageUI) => {
        const mockAvatar = message.metadata?.avatar as { src?: string | null; name: string } | undefined;
        const isSystemMessage = message.role === 'system';
        const isAssistantMessage = message.role === 'assistant';
        const isBotNotification = isSystemMessage
            && typeof message.metadata?.notificationType === 'string';
        const isBotMessage = isSystemMessage || isAssistantMessage || isBotNotification;

        if (mockAvatar) {
            return mockAvatar;
        }
        if (isBotMessage) {
            return practiceProfile.src || practiceProfile.name !== 'Practice'
                ? practiceProfile
                : blawbyProfile;
        }
        if (message.isUser) {
            return currentUserProfile;
        }
        return isPracticeViewer ? clientProfile : practiceProfile;
    };

    const resolveModeSelector = (message: ChatMessageUI) => {
        if (!modeSelectorActions) {
            return undefined;
        }
        const meta = message.metadata?.modeSelector;
        if (!meta) {
            return undefined;
        }
        if (meta === true) {
            return {
                onAskQuestion: modeSelectorActions.onAskQuestion,
                onRequestConsultation: modeSelectorActions.onRequestConsultation
            };
        }
        if (typeof meta === 'object') {
            const metaConfig = meta as { showAskQuestion?: boolean; showRequestConsultation?: boolean };
            return {
                onAskQuestion: modeSelectorActions.onAskQuestion,
                onRequestConsultation: modeSelectorActions.onRequestConsultation,
                showAskQuestion: metaConfig.showAskQuestion,
                showRequestConsultation: metaConfig.showRequestConsultation
            };
        }
        return undefined;
    };

    const resolveLeadReview = (message: ChatMessageUI) => {
        if (!leadReviewActions || !isPracticeViewer) {
            return undefined;
        }
        const metadata = message.metadata;
        if (!metadata || typeof metadata !== 'object') {
            return undefined;
        }
        const systemKey = (metadata as Record<string, unknown>).systemMessageKey;
        if (systemKey !== 'intake_summary') {
            return undefined;
        }
        const leadId = typeof (metadata as Record<string, unknown>).leadId === 'string'
            ? (metadata as Record<string, unknown>).leadId as string
            : (typeof (metadata as Record<string, unknown>).matterId === 'string'
                ? (metadata as Record<string, unknown>).matterId as string
                : null);
        if (!leadId || !leadReviewActions.practiceId || !leadReviewActions.conversationId) {
            return undefined;
        }

        const isSubmitting = Boolean(leadActionState[leadId]);

        const runLeadAction = async (action: 'accept' | 'reject') => {
            if (!leadReviewActions.canReviewLeads || isSubmitting) {
                return;
            }
            setLeadActionState((prev) => ({ ...prev, [leadId]: action }));
            try {
                let result: MatterTransitionResult;
                if (action === 'accept') {
                    result = await leadReviewActions.acceptMatter(leadReviewActions.practiceId, leadId);
                } else {
                    result = await leadReviewActions.rejectMatter(leadReviewActions.practiceId, leadId);
                }

                if (result.error || result.success === false) {
                    throw new Error(result.error || 'The action could not be completed at this time.');
                }

                const practiceName = leadReviewActions.practiceName || 'The practice';
                const content = action === 'accept'
                    ? `${practiceName} has joined the conversation.`
                    : `${practiceName} was unable to take your request at this time.`;

                try {
                    await postSystemMessage(
                        leadReviewActions.conversationId,
                        leadReviewActions.practiceId,
                        {
                            clientId: action === 'accept' ? 'system-lead-accepted' : 'system-lead-declined',
                            content,
                            metadata: {
                                systemMessageKey: action === 'accept' ? 'lead_accepted' : 'lead_declined',
                                leadId
                            }
                        }
                    );
                } catch (msgErr) {
                    console.error('[VirtualMessageList] Failed to post system message', msgErr);
                    // Continue - transition succeeded, just log the message failure
                }

                showSuccess(
                    action === 'accept' ? 'Lead accepted' : 'Lead declined',
                    action === 'accept'
                        ? 'The client has been notified.'
                        : 'The client has been notified of the decline.'
                );
                leadReviewActions.onLeadStatusChange?.();
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to update lead';
                showError('Action failed', message);
            } finally {
                setLeadActionState((prev) => {
                    const next = { ...prev };
                    delete next[leadId];
                    return next;
                });
            }
        };

        return {
            canReview: leadReviewActions.canReviewLeads,
            isSubmitting,
            onAccept: () => void runLeadAction('accept'),
            onReject: () => void runLeadAction('reject')
        };
    };

    const checkIfScrolledToBottom = useCallback((element: HTMLElement) => {
        const { scrollTop, scrollHeight, clientHeight } = element;
        return Math.abs(scrollHeight - scrollTop - clientHeight) < 10;
    }, []);

    const handleScrollLoadMore = useCallback(() => {
        if (!listRef.current) return;

        const element = listRef.current;

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
        hasMoreMessages,
        isLoadingMoreMessages,
        onLoadMoreMessages
    ]);

    const debouncedHandleScroll = useMemo(() => {
        return debounce(handleScrollLoadMore, DEBOUNCE_DELAY);
    }, [handleScrollLoadMore]);

    const handleScrollImmediate = useCallback(() => {
        if (!listRef.current) return;

        const element = listRef.current;
        const isBottom = checkIfScrolledToBottom(element);
        isScrolledToBottomRef.current = isBottom;
        isUserScrollingRef.current = !isBottom;

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

        debouncedHandleScroll();
    }, [checkIfScrolledToBottom, debouncedHandleScroll]);

    useEffect(() => {
        const list = listRef.current;
        if (list) {
            list.addEventListener('scroll', handleScrollImmediate, { passive: true });
        }
        return () => {
            if (list) {
                list.removeEventListener('scroll', handleScrollImmediate);
            }
            // Cancel any pending debounced calls to prevent delayed state updates after unmount
            debouncedHandleScroll.cancel();
        };
    }, [debouncedHandleScroll, handleScrollImmediate]);

    useEffect(() => {
        // Update indices when new messages are added
        if (isScrolledToBottomRef.current) {
            setEndIndex(dedupedMessages.length);
            setStartIndex(Math.max(0, dedupedMessages.length - BATCH_SIZE));
        }
    }, [dedupedMessages.length]);

    useEffect(() => {
        const lastMessage = dedupedMessages[dedupedMessages.length - 1];
        if (!lastMessage?.paymentRequest) return;
        setEndIndex(dedupedMessages.length);
        setStartIndex(Math.max(0, dedupedMessages.length - BATCH_SIZE));
        if (listRef.current) {
            listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'auto' });
        }
    }, [dedupedMessages]);

    useLayoutEffect(() => {
        // Scroll to bottom when new messages are added and we're at the bottom
        if (listRef.current && isScrolledToBottomRef.current && !isUserScrollingRef.current) {
            listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'auto' });
        }
    }, [dedupedMessages, endIndex]);


    const visibleMessages = useMemo(
        () => dedupedMessages.slice(startIndex, endIndex),
        [dedupedMessages, startIndex, endIndex]
    );
    const messageMap = useMemo(() => {
        return new Map(dedupedMessages.map((message) => [message.id, message]));
    }, [dedupedMessages]);

    const scrollToMessage = useCallback((messageId: string) => {
        if (!messageId) {
            return;
        }
        const targetIndex = dedupedMessages.findIndex((message) => message.id === messageId);
        if (targetIndex === -1) {
            return;
        }

        const nextStart = Math.max(0, targetIndex - Math.floor(BATCH_SIZE / 2));
        const nextEnd = Math.min(dedupedMessages.length, nextStart + BATCH_SIZE);
        setStartIndex(nextStart);
        setEndIndex(nextEnd);
        isScrolledToBottomRef.current = false;
        isUserScrollingRef.current = true;

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const element = document.getElementById(`message-${messageId}`);
                if (element) {
                    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
                }
            });
        });
    }, [dedupedMessages]);

    useEffect(() => {
        if (!onRequestReactions || visibleMessages.length === 0) {
            return;
        }
        visibleMessages.forEach((message) => {
            if (!message.id) return;
            if (message.reactions !== undefined) return;
            void onRequestReactions(message.id);
        });
    }, [onRequestReactions, visibleMessages]);

    return (
        <div
            className={`flex-1 overflow-y-auto p-4 ${isPublicWorkspace ? 'pt-0' : 'pt-2'} lg:pt-4 pb-20 scroll-smooth w-full scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600`}
            ref={listRef}
        >
            {/* Practice Profile Header - Fixed at top of scrollable area */}
            {practiceConfig && showPracticeHeader && (
                <div className="flex flex-col items-center py-3 px-3 border-b border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg mb-2">
                    <PracticeProfile
                        name={practiceConfig.name}
                        profileImage={practiceConfig.profileImage}
                        practiceSlug={practiceConfig.slug ?? practiceConfig.practiceId}
                        description={practiceConfig.description}
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
            {showSkeleton && (
                <div className="mt-4 space-y-5">
                    <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-white/10" />
                        <div className="space-y-2">
                            <div className="h-3 w-36 rounded bg-gray-200 dark:bg-white/10" />
                            <div className="h-3 w-60 rounded bg-gray-200 dark:bg-white/10" />
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-white/10" />
                        <div className="space-y-2">
                            <div className="h-3 w-44 rounded bg-gray-200 dark:bg-white/10" />
                            <div className="h-3 w-72 rounded bg-gray-200 dark:bg-white/10" />
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-white/10" />
                        <div className="space-y-2">
                            <div className="h-3 w-32 rounded bg-gray-200 dark:bg-white/10" />
                            <div className="h-3 w-56 rounded bg-gray-200 dark:bg-white/10" />
                        </div>
                    </div>
                </div>
            )}
            <ErrorBoundary>
                {visibleMessages.map((message, _index) => {
                    const avatar = resolveAvatar(message);
                    const replyId = typeof message.reply_to_message_id === 'string'
                        ? message.reply_to_message_id
                        : null;
                    const replySource = replyId ? messageMap.get(replyId) : null;
                    const replyAvatar = replySource ? resolveAvatar(replySource) : undefined;
                    const replyPreview: ReplyTarget | null = replyId ? {
                        messageId: replyId,
                        authorName: replyAvatar?.name ?? 'Original message',
                        content: replySource?.content ?? '',
                        avatar: replyAvatar,
                        isMissing: !replySource
                    } : null;
                    const canReply = Boolean(onReply && message.id);

                    const modeSelector = resolveModeSelector(message);
                    const leadReview = resolveLeadReview(message);

                    return (
                        <Message
                            key={message.id}
                            content={message.content}
                            isUser={message.isUser}
                            files={message.files}
                            avatar={avatar}
                            authorName={avatar?.name}
                            timestamp={message.timestamp}
                            replyPreview={replyPreview ?? undefined}
                            onReplyPreviewClick={replyPreview ? () => scrollToMessage(replyPreview.messageId) : undefined}
                            reactions={message.reactions}
                            onReply={canReply ? () => {
                                if (!onReply) return;
                                onReply({
                                    messageId: message.id,
                                    authorName: avatar?.name || 'Unknown',
                                    content: message.content,
                                    avatar
                                });
                            } : undefined}
                            onToggleReaction={onToggleReaction ? (emoji: string) => {
                                if (!message.id) return;
                                onToggleReaction(message.id, emoji);
                            } : undefined}
                            matterCanvas={message.matterCanvas}
                            contactForm={message.contactForm}
                            contactFormVariant={contactFormVariant}
                            contactFormFormId={contactFormFormId}
                            showContactFormSubmit={showContactFormSubmit}
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
                            modeSelector={modeSelector}
                            leadReview={leadReview}
                            intakeStatus={_intakeStatus}
                        />
                    );
                })}
            </ErrorBoundary>
        </div>
    );
};

export default memo(VirtualMessageList); 
