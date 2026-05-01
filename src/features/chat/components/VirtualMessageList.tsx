import { FunctionComponent } from 'preact';
import { useRef, useEffect, useState, useCallback, useLayoutEffect, useMemo } from 'preact/hooks';
import Message from './Message';
import { memo } from 'preact/compat';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { Icon } from '@/shared/ui/Icon';
import { debounce } from '@/shared/utils/debounce';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { ChatMessageUI } from '../../../../worker/types';
import type { ChatMessageAction } from '@/shared/types/conversation';
import type { IntakePaymentRequest } from '@/shared/utils/intakePayments';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useIntakeContext } from '@/shared/contexts/IntakeContext';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import type { ReplyTarget } from '@/features/chat/types';
import { isIntakeSubmittable } from '@/shared/utils/consultationState';
import { MessageRowSkeleton } from '@/shared/ui/layout';
import { quickActionDebugLog, isQuickActionDebugEnabled } from '@/shared/utils/quickActionDebug';
import { createBuildBriefAction, createSubmitAction, hasTerminalChatAction, hasBuildBriefAction, normalizeChatActions } from '@/shared/utils/chatActions';
import { STREAMING_BUBBLE_PREFIX } from '@/shared/hooks/useConversation';
import { features } from '@/config/features';

export interface OnboardingActions {
    onSaveAll?: () => void | Promise<void>;
    onEditBasics?: () => void;
    onEditContact?: () => void;
    onLogoChange?: (files: FileList | File[]) => void;
    logoUploading?: boolean;
    logoUploadProgress?: number | null;
    logoUrl?: string | null;
    practiceName?: string;
    isSaving?: boolean;
    saveError?: string | null;
}

interface VirtualMessageListProps {
    messages: ChatMessageUI[];
    conversationTitle?: string | null;
    conversationContactName?: string | null;
    viewerContext?: 'practice' | 'client' | 'public';
    practiceConfig?: {
        name: string;
        profileImage: string | null;
        practiceId: string;
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
    hasSlimContactDraft?: boolean;
    onQuickReply?: (text: string) => void;
    modeSelectorActions?: {
        onAskQuestion: () => void;
        onRequestConsultation: () => void;
    };
    hasMoreMessages?: boolean;
    isLoadingMoreMessages?: boolean;
    onLoadMoreMessages?: () => void | Promise<void>;
    showSkeleton?: boolean;
    compactLayout?: boolean;
    onboardingActions?: OnboardingActions;
    bottomInsetPx?: number;
    hideMessageActions?: boolean;
}

const BATCH_SIZE = 20;
const SCROLL_THRESHOLD = 100;
const STICKY_BOTTOM_THRESHOLD = 72;
const DEBOUNCE_DELAY = 50;
const DEBUG_PAGINATION = typeof process !== 'undefined' && process.env.NODE_ENV === 'development';
const VirtualMessageList: FunctionComponent<VirtualMessageListProps> = ({
    messages,
    conversationTitle,
    conversationContactName,
    viewerContext,
    practiceConfig,
    isPublicWorkspace = false,
    onOpenSidebar,
    practiceId,
    onReply,
    onToggleReaction,
    onRequestReactions,
    onAuthPromptRequest,
    hasSlimContactDraft = false,
    onQuickReply,
    modeSelectorActions,

    hasMoreMessages,
    isLoadingMoreMessages,
    onLoadMoreMessages,
    showSkeleton = false,
    compactLayout = false,
    onboardingActions,
    bottomInsetPx,
    hideMessageActions = false,
}) => {
    useEffect(() => {
        if (DEBUG_PAGINATION) {
            console.info('[VirtualMessageList][pagination] instrumentation active');
        }
    }, []);

    const { session } = useSessionContext();
    const { showError } = useToastContext();
    const intakeContext = useIntakeContext();
    const intakeStatus = intakeContext.intakeStatus;
    const intakeConversationState = intakeContext.intakeConversationState;
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
    const _submittingRef = useRef<Record<string, boolean>>({});
    const [startIndex, setStartIndex] = useState(Math.max(0, dedupedMessages.length - BATCH_SIZE));
    const [endIndex, setEndIndex] = useState(dedupedMessages.length);
    const [showScrollToBottom, setShowScrollToBottom] = useState(false);
    const isScrolledToBottomRef = useRef(true);
    const isUserScrollingRef = useRef(false);
    const hasUserScrolledUpRef = useRef(false);
    const isLoadingRef = useRef(false);
    const _loggedNoServerPaginationRef = useRef(false);
    const _prevHasMoreRef = useRef<boolean | undefined>(hasMoreMessages);
    const sessionUserName = session?.user?.name || session?.user?.email || '';
    const resolvedConversationName = conversationTitle?.trim() || '';
    const currentUserName = (
        isPublicWorkspace
        && (session?.user?.is_anonymous === true || !sessionUserName)
        && resolvedConversationName
    ) ? resolvedConversationName : (sessionUserName || 'You');
    const virtualizationEnabled = dedupedMessages.length > BATCH_SIZE * 2;
    const isNearTail = virtualizationEnabled && endIndex >= Math.max(0, dedupedMessages.length - 2);
    const useTailWindow = virtualizationEnabled && (isScrolledToBottomRef.current || isNearTail);

    const derivedStart = virtualizationEnabled
        ? (hasMoreMessages === false
            ? 0
            : (useTailWindow ? Math.max(0, dedupedMessages.length - BATCH_SIZE) : startIndex))
        : 0;
    const derivedEnd = virtualizationEnabled
        ? (hasMoreMessages === false || useTailWindow ? dedupedMessages.length : endIndex)
        : dedupedMessages.length;

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
        name: conversationContactName?.trim() || conversationTitle?.trim() || 'Contact'
    };
    const blawbyProfile = {
        src: '/blawby-favicon-iframe.png',
        name: 'Blawby'
    };
    const resolvedViewerContext = viewerContext ?? (isPublicWorkspace ? 'public' : 'client');

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
            if (onboardingActions) {
                return blawbyProfile;
            }
            return practiceProfile.src || practiceProfile.name !== 'Practice'
                ? practiceProfile
                : blawbyProfile;
        }
        if (message.isUser) {
            return currentUserProfile;
        }

        const senderType = typeof message.metadata?.senderType === 'string'
            ? message.metadata.senderType
            : null;
        if (senderType === 'client') {
            return clientProfile;
        }
        if (senderType === 'team_member') {
            return practiceProfile;
        }

        return resolvedViewerContext === 'practice' ? clientProfile : practiceProfile;
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
        return Math.abs(scrollHeight - scrollTop - clientHeight) < STICKY_BOTTOM_THRESHOLD;
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
        if (element.scrollTop < SCROLL_THRESHOLD && derivedStart > 0) {
            const newStartIndex = Math.max(0, derivedStart - BATCH_SIZE);
            if (DEBUG_PAGINATION) {
                console.info('[VirtualMessageList][pagination] revealing buffered messages', {
                    previousStartIndex: derivedStart,
                    nextStartIndex: newStartIndex
                });
            }
            setStartIndex(newStartIndex);
            setEndIndex(derivedEnd); // Lock current end into state when starting manual scroll


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
            derivedStart === 0 &&
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
        } else if (DEBUG_PAGINATION && element.scrollTop < SCROLL_THRESHOLD && derivedStart === 0) {
            console.info('[VirtualMessageList][pagination] at top but not loading from server', {
                hasMoreMessages: Boolean(hasMoreMessages),
                isLoadingMoreMessages: Boolean(isLoadingMoreMessages),
                internalLoading: Boolean(isLoadingRef.current),
                hasOnLoadMoreHandler: Boolean(onLoadMoreMessages)
            });
        }
    }, [
        derivedStart,
        derivedEnd,
        hasMoreMessages,
        isLoadingMoreMessages,
        onLoadMoreMessages,
        showError,
        startIndex
    ]);

    // Keep a stable ref to the latest handleScrollLoadMore so the debounce instance
    // doesn't need to be recreated each time handleScrollLoadMore changes deps.
    const handleScrollLoadMoreRef = useRef(handleScrollLoadMore);
    handleScrollLoadMoreRef.current = handleScrollLoadMore;

    // Single debounce instance for the component lifetime — prevents orphaned calls
    // when deps of handleScrollLoadMore change mid-scroll.
    const debouncedHandleScrollRef = useRef(
        debounce(() => { handleScrollLoadMoreRef.current(); }, DEBOUNCE_DELAY)
    );

    const handleScrollImmediate = useCallback(() => {
        if (!listRef.current) return;

        const element = listRef.current;
        const previousScrollTop = (element as HTMLElement & { lastScrollTop?: number }).lastScrollTop || 0;
        const currentScrollTop = element.scrollTop;
        const isScrollingUp = currentScrollTop < previousScrollTop;
        const isBottom = checkIfScrolledToBottom(element);
        isScrolledToBottomRef.current = isBottom;
        isUserScrollingRef.current = !isBottom;
        if (isBottom) {
            hasUserScrolledUpRef.current = false;
        } else if (isScrollingUp) {
            hasUserScrolledUpRef.current = true;
        }
        setShowScrollToBottom(hasUserScrolledUpRef.current && !isBottom);

        // Dispatch scroll event for navbar visibility
        const scrollDelta = Math.abs(currentScrollTop - previousScrollTop);

        if (scrollDelta > 0) {
            window.dispatchEvent(new CustomEvent('chat-scroll', {
                detail: { scrollTop: currentScrollTop, scrollDelta }
            }));
        }

        (element as HTMLElement & { lastScrollTop?: number }).lastScrollTop = currentScrollTop;

        debouncedHandleScrollRef.current();
    }, [checkIfScrolledToBottom]);

    useEffect(() => {
        const list = listRef.current;
        const debouncedScroll = debouncedHandleScrollRef.current;
        if (list) {
            list.addEventListener('scroll', handleScrollImmediate, { passive: true });
        }
        return () => {
            if (list) {
                list.removeEventListener('scroll', handleScrollImmediate);
            }
            // Cancel any pending debounced calls to prevent delayed state updates after unmount
            debouncedScroll.cancel();
        };
    }, [handleScrollImmediate]);



    useLayoutEffect(() => {
        // Scroll to bottom when new messages are added and we're at the bottom
        if (listRef.current && isScrolledToBottomRef.current && !isUserScrollingRef.current) {
            listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'auto' });
            setShowScrollToBottom(false);
        }
    }, [dedupedMessages, derivedEnd]);

    // Preserve sticky-to-bottom behavior when composer height changes.
    useLayoutEffect(() => {
        if (!listRef.current || compactLayout) return;
        if (!isScrolledToBottomRef.current || isUserScrollingRef.current) return;
        listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'auto' });
        setShowScrollToBottom(false);
    }, [bottomInsetPx, compactLayout]);

    const scrollToBottom = useCallback(() => {
        if (!listRef.current) return;
        listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
        isScrolledToBottomRef.current = true;
        isUserScrollingRef.current = false;
        hasUserScrolledUpRef.current = false;
        setShowScrollToBottom(false);
    }, []);


    const visibleMessages = useMemo(
        () => dedupedMessages.slice(derivedStart, derivedEnd),
        [dedupedMessages, derivedStart, derivedEnd]
    );
    const visibleMessageIdsKey = useMemo(
        () => visibleMessages.map((message) => message.id).join(','),
        [visibleMessages]
    );
    const quickActionDebugSnapshotRef = useRef('');
    const visibleMessagesRef = useRef<ChatMessageUI[]>(visibleMessages);
    const messageMap = useMemo(() => {
        return new Map(dedupedMessages.map((message) => [message.id, message]));
    }, [dedupedMessages]);
    const olderMessagesButtonClassName = 'text-xs sm:text-sm lg:text-base text-brand-purple hover:text-brand-purple-dark disabled:opacity-60';
    const intakeReady = isIntakeSubmittable(intakeConversationState, {
        paymentRequired: intakeStatus?.paymentRequired ?? null,
        paymentReceived: intakeStatus?.paymentReceived ?? null,
    });

    const buildMessageActions = useCallback((
        baseActions: ChatMessageAction[],
        message: ChatMessageUI,
        isLast: boolean
    ): ChatMessageAction[] => {
        const messageActions = [...baseActions];
        const shouldAppendSubmitAction =
            !message.isUser &&
            isLast &&
            intakeReady &&
            intakeConversationState?.ctaResponse !== 'ready' &&
            intakeStatus?.step !== 'pending_review' &&
            intakeStatus?.step !== 'completed';
        const shouldAppendDecisionActions =
            !message.isUser &&
            isLast &&
            message.metadata?.intakeDecisionPrompt === true &&
            intakeStatus?.step === 'contact_form_decision';

        if (shouldAppendDecisionActions) {
            if (!hasTerminalChatAction(messageActions)) {
                messageActions.push(createSubmitAction(intakeStatus?.paymentRequired ? 'Continue' : 'Submit'));
            }
            if (!hasBuildBriefAction(messageActions)) {
                messageActions.push(createBuildBriefAction('Build a stronger brief'));
            }
        } else if (shouldAppendSubmitAction && !hasTerminalChatAction(messageActions)) {
            messageActions.push(
                createSubmitAction(intakeStatus?.paymentRequired ? 'Continue' : 'Submit request')
            );
        }

        return messageActions;
    }, [intakeReady, intakeConversationState?.ctaResponse, intakeStatus?.paymentRequired, intakeStatus?.step]);

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
        visibleMessagesRef.current = visibleMessages;
    }, [visibleMessages]);

    useEffect(() => {
        if (!onRequestReactions || visibleMessagesRef.current.length === 0) {
            return;
        }
        
        const requestVisibleReactions = () => {
            if (!features.enableMessageReactions) return;
            
            const messagesToRequest = visibleMessagesRef.current.filter(message => {
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
    }, [onRequestReactions, visibleMessageIdsKey]); // Only re-run when message IDs change, not on every render

    useEffect(() => {
        if (!isQuickActionDebugEnabled()) return;

        const actionableMessages = visibleMessages
            .map((message, index) => {
                const isLast = (index + derivedStart) === (dedupedMessages.length - 1);
                const rawActions = normalizeChatActions(message.metadata?.actions);
                const baseActions = isLast ? rawActions : [];
                const messageActions = buildMessageActions(baseActions, message, isLast);

                const isActionable = isLast || rawActions.length > 0 || Boolean(message.paymentRequest) || messageActions.length > 0;
                if (!isActionable) return null;

                return {
                    messageId: message.id ?? null,
                    role: message.role,
                    isLast,
                    rawActions,
                    messageActions,
                    hasPaymentRequest: Boolean(message.paymentRequest),
                };
            })
            .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

        const snapshot = JSON.stringify({
            intakeReady,
            intakeStep: intakeStatus?.step ?? null,
            ctaResponse: intakeConversationState?.ctaResponse ?? null,
            actionableMessages,
        });

        if (snapshot === quickActionDebugSnapshotRef.current) {
            return;
        }
        quickActionDebugSnapshotRef.current = snapshot;

        quickActionDebugLog('VirtualMessageList action gating snapshot', {
            intakeReady,
            intakeStep: intakeStatus?.step ?? null,
            ctaResponse: intakeConversationState?.ctaResponse ?? null,
            actionableMessages,
        });
    }, [
        visibleMessages,
        derivedStart,
        dedupedMessages.length,
        buildMessageActions,
        intakeReady,
        intakeConversationState?.ctaResponse,
        intakeStatus?.step,
    ]);

    return (
        <div className="relative min-h-0 flex flex-1 flex-col">
        <div
            className={`message-list min-h-0 ${compactLayout ? 'flex-none' : 'flex-1'} overflow-y-auto py-4 ${isPublicWorkspace ? 'pt-0' : 'pt-2'} lg:pt-4 ${compactLayout ? 'pb-4' : 'pb-20'} scroll-smooth w-full scrollbar-thin scrollbar-track-transparent scrollbar-thumb-line-glass/40`}
            ref={listRef}
            style={!compactLayout ? { paddingBottom: `${Math.max(80, bottomInsetPx ?? 80)}px` } : undefined}
        >
            {hasMoreMessages && (
                <div
                    className="flex justify-center items-center py-4"
                    data-testid={derivedStart > 0 ? 'pagination-spacer' : undefined}
                    aria-hidden={derivedStart > 0 ? 'true' : undefined}
                >
                    {derivedStart === 0 ? (
                        <button
                            type="button"
                            className={olderMessagesButtonClassName}
                            onClick={() => onLoadMoreMessages?.()}
                            disabled={isLoadingMoreMessages}
                        >
                            {isLoadingMoreMessages ? (
                                <span className="inline-flex items-center">
                                    <LoadingSpinner size="sm" className="mr-2" ariaLabel="Loading older messages…" />
                                    Load older messages
                                </span>
                            ) : 'Load older messages'}
                        </button>
                    ) : (
                        <button
                            type="button"
                            className={`${olderMessagesButtonClassName} invisible pointer-events-none`}
                            disabled
                            tabIndex={-1}
                        >
                            Load older messages
                        </button>
                    )}
                </div>
            )}
            {showSkeleton && (
                <div className="mt-4 space-y-5">
                    <MessageRowSkeleton lineWidths={['w-36', 'w-60']} />
                    <MessageRowSkeleton lineWidths={['w-44', 'w-72']} />
                    <MessageRowSkeleton lineWidths={['w-32']} />
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
                    const isViewerAnonymous = session?.user?.is_anonymous === true;
                    const canReply = Boolean(onReply && message.id && resolvedViewerContext !== 'public' && !isViewerAnonymous);
                    const isLast = (_index + derivedStart) === (dedupedMessages.length - 1);
                    const isStreamingMessage = Boolean(message.id?.startsWith(STREAMING_BUBBLE_PREFIX));

                    const modeSelector = resolveModeSelector(message);

    const authCta = resolveAuthCta(message);

                    const intakeStep = intakeStatus?.step ?? null;
                    const intakeIsTerminal =
                        ['submitted', 'pending_review', 'completed'].includes(String(intakeStep));
                    const baseActions = (isLast && !isStreamingMessage)
                        ? normalizeChatActions(message.metadata?.actions).filter((action) => {
                            if (!intakeIsTerminal) return true;
                            return action.type === 'submit'
                                || action.type === 'continue_payment'
                                || action.type === 'open_url';
                        })
                        : [];
                    const messageActions = buildMessageActions(baseActions, message, isLast);
                    const onboardingMetaFromMessage = (
                        message.metadata && typeof message.metadata.onboardingProfile === 'object' && message.metadata.onboardingProfile
                    ) ? (message.metadata.onboardingProfile as Record<string, unknown>) : null;
                    const onboardingMeta = onboardingMetaFromMessage;
                    const onboardingProfile = onboardingMeta ? {
                        completionScore: typeof onboardingMeta.completionScore === 'number' ? onboardingMeta.completionScore : undefined,
                        missingFields: Array.isArray(onboardingMeta.missingFields)
                            ? onboardingMeta.missingFields.filter((v): v is string => typeof v === 'string')
                            : undefined,
                        summaryFields: Array.isArray(onboardingMeta.summaryFields)
                            ? onboardingMeta.summaryFields
                                .filter((item): item is { label: string; value: string } => (
                                    Boolean(item) &&
                                    typeof item === 'object' &&
                                    typeof (item as { label?: unknown }).label === 'string' &&
                                    typeof (item as { value?: unknown }).value === 'string'
                                ))
                            : undefined,
                        serviceNames: Array.isArray(onboardingMeta.serviceNames)
                            ? onboardingMeta.serviceNames.filter((v): v is string => typeof v === 'string')
                            : undefined,
                        canSave: onboardingMeta.canSave === true || Boolean(onboardingActions?.onSaveAll),
                        isSaving: onboardingActions?.isSaving,
                        saveError: onboardingActions?.saveError ?? null,
                        onSaveAll: onboardingActions?.onSaveAll,
                        onEditBasics: onboardingActions?.onEditBasics,
                        onEditContact: onboardingActions?.onEditContact,
                        logo: onboardingActions?.onLogoChange ? {
                            imageUrl: onboardingActions.logoUrl ?? null,
                            name: onboardingActions.practiceName ?? 'Practice',
                            uploading: onboardingActions.logoUploading === true,
                            progress: onboardingActions.logoUploadProgress ?? null,
                            onChange: onboardingActions.onLogoChange,
                        } : undefined,
                    } : undefined;
                    const stableClientId = typeof message.metadata?.__client_id === 'string'
                        ? message.metadata.__client_id
                        : null;
                    // Provide a guaranteed fallback key when both stableClientId and message.id are missing.
                    // Use the visible list index + startIndex so the fallback is stable across re-renders
                    // as long as the slice window doesn't change. This avoids undefined/null keys.
                    const fallbackIndexKey = `idx-${derivedStart + _index}`;
                    const renderKey = stableClientId
                        ? `client-${stableClientId}`
                        : (message.id ? `message-${message.id}` : fallbackIndexKey);
                    const isSystemEvent = message.role === 'system' && message.metadata?.source !== 'ai';

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
                            onReply={canReply ? onReply : undefined}
                            onToggleReaction={onToggleReaction}
                            matterCanvas={message.matterCanvas}
                            generatedPDF={message.generatedPDF}
                            paymentRequest={message.paymentRequest}
                            practiceConfig={practiceConfig}
                            onOpenSidebar={onOpenSidebar}
                            isStreaming={isStreamingMessage}
                            isLoading={message.isLoading}
                            // REMOVED: aiState - AI functionality removed
                            toolMessage={message.toolMessage}
                            id={message.id}
                            practiceId={practiceId}
                            assistantRetry={message.assistantRetry}
                            modeSelector={modeSelector}

                                authCta={authCta}
                                onAuthPromptRequest={onAuthPromptRequest}
                                actions={messageActions}
                                onActionReply={onQuickReply}
                                onboardingProfile={onboardingProfile}
                                isLast={isLast && !isStreamingMessage}
                                isSystemEvent={isSystemEvent}
                                hideMessageActions={hideMessageActions}
                            />
                        );
                    })}
            </ErrorBoundary>
        </div>
        {showScrollToBottom && (
            <button
                type="button"
                className="absolute bottom-4 left-1/2 z-20 inline-flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full bg-accent-500 text-accent-foreground shadow-lg transition hover:bg-accent-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-utility border border-line-utility"
                onClick={scrollToBottom}
                aria-label="Scroll to latest message"
            >
                <Icon icon={ChevronDownIcon} className="h-5 w-5"  />
            </button>
        )}
        </div>
    );
};

export default memo(VirtualMessageList); 
