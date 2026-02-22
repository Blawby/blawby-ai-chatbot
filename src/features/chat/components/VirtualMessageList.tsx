import { FunctionComponent } from 'preact';
import { useRef, useEffect, useState, useCallback, useLayoutEffect, useMemo } from 'preact/hooks';
import Message from './Message';
import { memo } from 'preact/compat';
import { debounce } from '@/shared/utils/debounce';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { ChatMessageUI } from '../../../../worker/types';
import type { IntakePaymentRequest } from '@/shared/utils/intakePayments';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { postSystemMessage } from '@/shared/lib/conversationApi';
import type { ReplyTarget } from '@/features/chat/types';
import type { IntakeConversationState } from '@/shared/types/intake';

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
    isPublicWorkspace?: boolean;
    onOpenSidebar?: () => void;
    onOpenPayment?: (request: IntakePaymentRequest) => void;
    practiceId?: string;
    onReply?: (target: ReplyTarget) => void;
    onToggleReaction?: (messageId: string, emoji: string) => void;
    onRequestReactions?: (messageId: string) => Promise<void> | void;
    onAuthPromptRequest?: () => void;
    intakeStatus?: {
        step: string;
        decision?: string;
        intakeUuid?: string | null;
        paymentRequired?: boolean;
        paymentReceived?: boolean;
    };
    intakeConversationState?: IntakeConversationState | null;
    hasSlimContactDraft?: boolean;
    onIntakeCtaResponse?: (response: 'ready' | 'not_yet') => void;
    onSubmitNow?: () => void | Promise<void>;
    onBuildBrief?: () => void;
    onQuickReply?: (text: string) => void;
    modeSelectorActions?: {
        onAskQuestion: () => void;
        onRequestConsultation: () => void;
    };
    leadReviewActions?: {
        practiceId: string;
        practiceName: string;
        conversationId: string;
        canReviewLeads: boolean;
        mattersBasePath: string;
        navigateTo: (path: string) => void;
    };
    hasMoreMessages?: boolean;
    isLoadingMoreMessages?: boolean;
    onLoadMoreMessages?: () => void | Promise<void>;
    showSkeleton?: boolean;
    compactLayout?: boolean;
}

const BATCH_SIZE = 20;
const SCROLL_THRESHOLD = 100;
const DEBOUNCE_DELAY = 50;
const DEBUG_PAGINATION = typeof process !== 'undefined' && process.env.NODE_ENV === 'development';
const INTAKE_READY_PROMPT_REGEX = /(are you ready to submit|ready to submit|submit your request|submit this|submit this information|would you like to submit|would you like to continue now)/i;

const VirtualMessageList: FunctionComponent<VirtualMessageListProps> = ({
    messages,
    conversationTitle,
    practiceConfig,
    isPublicWorkspace = false,
    onOpenSidebar,
    onOpenPayment,
    practiceId,
    onReply,
    onToggleReaction,
    onRequestReactions,
    onAuthPromptRequest,
    intakeStatus: _intakeStatus,
    intakeConversationState,
    hasSlimContactDraft = false,
    onIntakeCtaResponse,
    onSubmitNow,
    onBuildBrief,
    onQuickReply,
    modeSelectorActions,
    leadReviewActions,
    hasMoreMessages,
    isLoadingMoreMessages,
    onLoadMoreMessages,
    showSkeleton = false,
    compactLayout = false
}) => {
    useEffect(() => {
        if (DEBUG_PAGINATION) {
            console.info('[VirtualMessageList][pagination] instrumentation active');
        }
    }, []);

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
    const submittingRef = useRef<Record<string, boolean>>({});
    const [startIndex, setStartIndex] = useState(Math.max(0, dedupedMessages.length - BATCH_SIZE));
    const [endIndex, setEndIndex] = useState(dedupedMessages.length);
    const isScrolledToBottomRef = useRef(true);
    const isUserScrollingRef = useRef(false);
    const isLoadingRef = useRef(false);
    const loggedNoServerPaginationRef = useRef(false);
    const prevHasMoreRef = useRef<boolean | undefined>(hasMoreMessages);
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
    const [leadTriageStatus, setLeadTriageStatus] = useState<Record<string, string>>({});
    const triageStatusRequestedRef = useRef(new Set<string>());
    const isMountedRef = useRef(true);

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (!DEBUG_PAGINATION) return;
        if (startIndex !== 0) {
            loggedNoServerPaginationRef.current = false;
            return;
        }
        if (hasMoreMessages) {
            loggedNoServerPaginationRef.current = false;
            return;
        }
        if (loggedNoServerPaginationRef.current) return;
        loggedNoServerPaginationRef.current = true;
        console.info('[VirtualMessageList][pagination] server pagination disabled for current state', {
            startIndex,
            hasMoreMessages: Boolean(hasMoreMessages),
            isLoadingMoreMessages: Boolean(isLoadingMoreMessages),
            hasOnLoadMoreHandler: Boolean(onLoadMoreMessages)
        });
    }, [startIndex, hasMoreMessages, isLoadingMoreMessages, onLoadMoreMessages]);

    useEffect(() => {
        if (!leadReviewActions || !isPracticeViewer) {
            return;
        }
        const intakeUuids = dedupedMessages
            .map((message) => {
                const metadata = message.metadata;
                if (!metadata || typeof metadata !== 'object') return null;
                const meta = metadata as Record<string, unknown>;
                if (meta.intakeSubmitted !== true) return null;
                return typeof meta.intakeUuid === 'string' ? meta.intakeUuid : null;
            })
            .filter((value): value is string => Boolean(value));

        const controllers = new Map<string, AbortController>();

        intakeUuids.forEach((intakeUuid) => {
            if (leadTriageStatus[intakeUuid]) return;
            if (triageStatusRequestedRef.current.has(intakeUuid)) return;
            triageStatusRequestedRef.current.add(intakeUuid);

            const controller = new AbortController();
            controllers.set(intakeUuid, controller);

            void fetch(`/api/practice/client-intakes/${encodeURIComponent(intakeUuid)}/status`, {
                credentials: 'include',
                signal: controller.signal,
            })
                .then(async (response) => {
                    if (!isMountedRef.current) return;
                    if (!response.ok) {
                        const errData = await response.json().catch(() => ({})) as { error?: string; message?: string };
                        throw new Error(errData.message ?? errData.error ?? `HTTP ${response.status}`);
                    }
                    const payload = await response.json() as {
                        success?: boolean;
                        data?: { triage_status?: string };
                    };
                    const triageStatus = payload.data?.triage_status;
                    if (typeof triageStatus === 'string' && triageStatus.length > 0) {
                        if (isMountedRef.current) {
                            setLeadTriageStatus((prev) => ({ ...prev, [intakeUuid]: triageStatus }));
                        }
                    }
                })
                .catch((error) => {
                    if (error instanceof Error && error.name === 'AbortError') return;
                    console.warn('[VirtualMessageList] Failed to hydrate intake triage status', { intakeUuid, error });
                    if (isMountedRef.current) {
                        triageStatusRequestedRef.current.delete(intakeUuid);
                    }
                });
        });

        return () => {
            controllers.forEach((controller) => controller.abort());
        };
    }, [dedupedMessages, isPracticeViewer, leadReviewActions, leadTriageStatus]);

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
                onRequestConsultation: modeSelectorActions.onRequestConsultation,
                showRequestConsultation: !hasSlimContactDraft,
            };
        }
        if (typeof meta === 'object') {
            const metaConfig = meta as { showAskQuestion?: boolean; showRequestConsultation?: boolean };
            return {
                onAskQuestion: modeSelectorActions.onAskQuestion,
                onRequestConsultation: modeSelectorActions.onRequestConsultation,
                showAskQuestion: metaConfig.showAskQuestion,
                showRequestConsultation: hasSlimContactDraft ? false : metaConfig.showRequestConsultation
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
        const meta = metadata as Record<string, unknown>;

        // New trigger: system message written by handleSubmitNow
        if (meta.intakeSubmitted !== true) {
            return undefined;
        }
        const intakeUuid = typeof meta.intakeUuid === 'string' ? meta.intakeUuid : null;
        if (!intakeUuid || !leadReviewActions.practiceId || !leadReviewActions.conversationId) {
            return undefined;
        }
        const triageStatus = typeof meta.triageStatus === 'string'
            ? meta.triageStatus
            : (typeof meta.triage_status === 'string' ? meta.triage_status : null);

        const isSubmittingState = Boolean(leadActionState[intakeUuid]);
        const resolvedTriageStatus = triageStatus ?? leadTriageStatus[intakeUuid] ?? null;
        const isAccepted = resolvedTriageStatus === 'accepted';

        const runLeadAction = async (action: 'accept' | 'reject') => {
            if (!leadReviewActions.canReviewLeads || isSubmittingState || submittingRef.current[intakeUuid]) {
                return;
            }
            submittingRef.current[intakeUuid] = true;
            setLeadActionState((prev) => ({ ...prev, [intakeUuid]: action }));
            try {
                // Call backend intake status endpoint directly
                const response = await fetch(
                    `/api/practice/client-intakes/${encodeURIComponent(intakeUuid)}/status`,
                    {
                        method: 'PATCH',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            status: action === 'accept' ? 'accepted' : 'declined',
                            ...(action === 'reject' ? { reason: 'Declined by practice.' } : {}),
                        }),
                    }
                );

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({})) as { error?: string; message?: string };
                    throw new Error(errData.message ?? errData.error ?? `HTTP ${response.status}`);
                }
                setLeadTriageStatus((prev) => ({
                    ...prev,
                    [intakeUuid]: action === 'accept' ? 'accepted' : 'declined',
                }));

                const practiceName = leadReviewActions.practiceName || 'The practice';
                const content = action === 'accept'
                    ? `${practiceName} has accepted your consultation request.`
                    : `${practiceName} was unable to take your request at this time.`;

                let systemMessageFailed = false;
                try {
                    await postSystemMessage(
                        leadReviewActions.conversationId,
                        leadReviewActions.practiceId,
                        {
                            clientId: action === 'accept' ? 'system-lead-accepted' : 'system-lead-declined',
                            content,
                            metadata: {
                                systemMessageKey: action === 'accept' ? 'lead_accepted' : 'lead_declined',
                                intakeUuid,
                                triageStatus: action === 'accept' ? 'accepted' : 'declined',
                                triage_status: action === 'accept' ? 'accepted' : 'declined',
                            }
                        }
                    );
                } catch (msgErr) {
                    console.error('[VirtualMessageList] Failed to post system message', msgErr);
                    systemMessageFailed = true;
                }

                showSuccess(
                    action === 'accept' ? 'Intake accepted' : 'Intake declined',
                    systemMessageFailed
                        ? 'Status updated; client notification failed.'
                        : (action === 'accept' ? 'Client has been notified.' : 'Client has been notified of the decline.')
                );
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to update intake';
                showError('Action failed', message);
            } finally {
                if (isMountedRef.current) {
                    setLeadActionState((prev) => {
                        const next = { ...prev };
                        delete next[intakeUuid];
                        return next;
                    });
                    delete submittingRef.current[intakeUuid];
                }
            }
        };

        return {
            canReview: leadReviewActions.canReviewLeads,
            isSubmitting: isSubmittingState,
            onAccept: () => void runLeadAction('accept'),
            onReject: () => void runLeadAction('reject'),
            onConvert: isAccepted ? () => {
                const params = new URLSearchParams({ convertIntake: intakeUuid });
                leadReviewActions.navigateTo(`${leadReviewActions.mattersBasePath}/new?${params.toString()}`);
            } : undefined,
        };
    };

    const resolveAuthCta = useCallback((message: ChatMessageUI) => {
        const metadata = message.metadata;
        if (!metadata || typeof metadata !== 'object') {
            return undefined;
        }
        const authCta = (metadata as Record<string, unknown>).authCta;
        if (!authCta || typeof authCta !== 'object' || Array.isArray(authCta)) {
            return undefined;
        }
        const label = typeof (authCta as Record<string, unknown>).label === 'string'
            ? String((authCta as Record<string, unknown>).label)
            : '';
        const trimmedLabel = label.trim();
        if (!trimmedLabel) return undefined;
        return { label: trimmedLabel };
    }, []);

    const checkIfScrolledToBottom = useCallback((element: HTMLElement) => {
        const { scrollTop, scrollHeight, clientHeight } = element;
        return Math.abs(scrollHeight - scrollTop - clientHeight) < 10;
    }, []);

    const handleScrollLoadMore = useCallback(() => {
        if (!listRef.current) return;

        const element = listRef.current;
        if (DEBUG_PAGINATION) {
            console.info('[VirtualMessageList][pagination] scroll check', {
                scrollTop: element.scrollTop,
                threshold: SCROLL_THRESHOLD,
                startIndex,
                hasMoreMessages: Boolean(hasMoreMessages),
                isLoadingMoreMessages: Boolean(isLoadingMoreMessages),
                internalLoading: Boolean(isLoadingRef.current),
                hasOnLoadMoreHandler: Boolean(onLoadMoreMessages)
            });
        }

        // Load more messages when scrolling up (client-side)
        if (element.scrollTop < SCROLL_THRESHOLD && startIndex > 0) {
            const newStartIndex = Math.max(0, startIndex - BATCH_SIZE);
            if (DEBUG_PAGINATION) {
                console.info('[VirtualMessageList][pagination] revealing buffered messages', {
                    previousStartIndex: startIndex,
                    nextStartIndex: newStartIndex
                });
            }
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
            if (DEBUG_PAGINATION) {
                console.info('[VirtualMessageList][pagination] requesting older messages from server');
            }
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
                    showError('Failed to load more messages', 'Please try again.');
                })
                .finally(() => {
                    isLoadingRef.current = false;
                    if (DEBUG_PAGINATION) {
                        console.info('[VirtualMessageList][pagination] server request finished');
                    }
                });
        } else if (DEBUG_PAGINATION && element.scrollTop < SCROLL_THRESHOLD && startIndex === 0) {
            console.info('[VirtualMessageList][pagination] at top but not loading from server', {
                hasMoreMessages: Boolean(hasMoreMessages),
                isLoadingMoreMessages: Boolean(isLoadingMoreMessages),
                internalLoading: Boolean(isLoadingRef.current),
                hasOnLoadMoreHandler: Boolean(onLoadMoreMessages)
            });
        }
    }, [
        startIndex,
        hasMoreMessages,
        isLoadingMoreMessages,
        onLoadMoreMessages,
        showError
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
        // If server pagination is exhausted, show full local history instead of
        // keeping a virtualized window that implies more content is loading.
        // Only fire when hasMoreMessages transitions from true to false.
        if (prevHasMoreRef.current === true && hasMoreMessages === false) {
            setStartIndex(0);
            setEndIndex(dedupedMessages.length);
        }
        prevHasMoreRef.current = hasMoreMessages;
    }, [hasMoreMessages, dedupedMessages.length]);

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

    // Track which message IDs we've already dispatched a reactions request for.
    // This is separate from the reactionLoadedRef in useMessageHandling — it prevents
    // the effect below from firing duplicate requests during the window between calling
    // onRequestReactions and the reactions state update propagating back to this component.
    const reactionRequestedRef = useRef(new Set<string>());

    useEffect(() => {
        if (!onRequestReactions || visibleMessages.length === 0) {
            return;
        }
        
        const requestVisibleReactions = () => {
            const messagesToRequest = visibleMessages.filter(message => {
                if (!message.id) return false;
                // Skip if reactions are already loaded on the message object.
                if (message.reactions !== undefined) return false;
                // Skip if we've already dispatched a request for this message ID.
                if (reactionRequestedRef.current.has(message.id)) return false;
                return true;
            });
            
            if (messagesToRequest.length === 0) return;
            
            messagesToRequest.forEach((message) => {
                if (!message.id) return;
                reactionRequestedRef.current.add(message.id);
                // Fire and forget with error handling cleanup
                // Wrap in Promise.resolve to handle both async and sync returns, though void returns won't trigger catch
                Promise.resolve(onRequestReactions(message.id)).catch((error) => {
                    // Only log if really needed, to avoid noise. The user asked to remove message.id on failure.
                    // We'll log a warning to be helpful for debugging but keep it minimal.
                    console.warn('[VirtualMessageList] Failed to load reactions, allowing retry', { id: message.id, error });
                    reactionRequestedRef.current.delete(message.id);
                });
            });
        };
        
        requestVisibleReactions();
    }, [onRequestReactions, visibleMessages]);

    return (
        <div
            className={`message-list ${compactLayout ? 'flex-none' : 'flex-1'} overflow-y-auto p-4 ${isPublicWorkspace ? 'pt-0' : 'pt-2'} lg:pt-4 ${compactLayout ? 'pb-4' : 'pb-20'} scroll-smooth w-full scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600`}
            ref={listRef}
        >
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
                    const authCta = resolveAuthCta(message);

                    const quickReplies = Array.isArray(message.metadata?.quickReplies)
                        ? message.metadata.quickReplies.filter((value: unknown): value is string => typeof value === 'string')
                        : undefined;
                    const intakeStrength = intakeConversationState?.caseStrength ?? null;
                    const fallbackIntakeReadyCta =
                        !message.isUser &&
                        (intakeStrength === 'developing' || intakeStrength === 'strong') &&
                        typeof message.content === 'string' &&
                        INTAKE_READY_PROMPT_REGEX.test(message.content);
                    const stableClientId = typeof message.metadata?.__client_id === 'string'
                        ? message.metadata.__client_id
                        : null;
                    // Provide a guaranteed fallback key when both stableClientId and message.id are missing.
                    // Use the visible list index + startIndex so the fallback is stable across re-renders
                    // as long as the slice window doesn't change. This avoids undefined/null keys.
                    const fallbackIndexKey = `idx-${startIndex + _index}`;
                    const renderKey = stableClientId
                        ? `client-${stableClientId}`
                        : (message.id ? `message-${message.id}` : fallbackIndexKey);

                    return (
                            <Message
                                key={renderKey}
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
                            generatedPDF={message.generatedPDF}
                            paymentRequest={message.paymentRequest}
                            practiceConfig={practiceConfig}
                            onOpenSidebar={onOpenSidebar}
                            onOpenPayment={onOpenPayment}
                            isLoading={message.isLoading}
                            // REMOVED: aiState - AI functionality removed
                            toolMessage={message.toolMessage}
                            id={message.id}
                            practiceId={practiceId}
                            assistantRetry={message.assistantRetry}
                            modeSelector={modeSelector}
                            leadReview={leadReview}
                            authCta={authCta}
                                onAuthPromptRequest={onAuthPromptRequest}
                                intakeStatus={_intakeStatus}
                                intakeConversationState={intakeConversationState}
                                quickReplies={quickReplies}
                                onQuickReply={onQuickReply}
                                showIntakeCta={Boolean(message.metadata?.intakeReadyCta) || fallbackIntakeReadyCta}
                                showIntakeDecisionPrompt={message.metadata?.intakeDecisionPrompt === true}
                                onIntakeCtaResponse={onIntakeCtaResponse}
                                onSubmitNow={onSubmitNow}
                                onBuildBrief={onBuildBrief}
                            />
                        );
                    })}
            </ErrorBoundary>
        </div>
    );
};

export default memo(VirtualMessageList); 
