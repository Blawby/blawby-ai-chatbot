import { useState, useEffect, useCallback } from 'preact/hooks';
import type { ChatMessageUI, FileAttachment } from '../../worker/types';
import { 
	MOCK_MESSAGES, 
	MOCK_MESSAGES_WITH_AVATARS, 
	MOCK_MESSAGES_WITH_FILES,
	MOCK_PRACTICE_CONFIG,
	isMockModeEnabled,
	toggleMockMode
} from '../components/chat/mock/mockChatData';

interface UseMockChatReturn {
	messages: ChatMessageUI[];
	sendMessage: (message: string, attachments?: FileAttachment[]) => Promise<void>;
	practiceConfig: typeof MOCK_PRACTICE_CONFIG;
	isMockMode: boolean;
	setMockMode: (enabled: boolean) => void;
	clearMessages: () => void;
	resetToDefault: () => void;
	loadMockSet: (set: 'default' | 'avatars' | 'files') => void;
}

/**
 * Hook for using mock chat data during UI development
 * 
 * Usage:
 * ```tsx
 * const { messages, sendMessage, practiceConfig, isMockMode, setMockMode } = useMockChat();
 * ```
 */
export const useMockChat = (): UseMockChatReturn => {
	const [isMockMode, setIsMockMode] = useState(isMockModeEnabled());
	const [messages, setMessages] = useState<ChatMessageUI[]>(MOCK_MESSAGES);

	// Sync with localStorage changes (e.g., from console or other tabs)
	useEffect(() => {
		const checkStorage = () => {
			const stored = isMockModeEnabled();
			if (stored !== isMockMode) {
				setIsMockMode(stored);
			}
		};
		
		// Check on mount
		checkStorage();
		
		// Listen for storage changes (e.g., from other tabs or console)
		if (typeof window !== 'undefined') {
			window.addEventListener('storage', checkStorage);
			return () => window.removeEventListener('storage', checkStorage);
		}
	}, [isMockMode]);

	const handleSetMockMode = useCallback((enabled: boolean) => {
		setIsMockMode(enabled);
		toggleMockMode(enabled);
		if (enabled && messages.length === 0) {
			setMessages(MOCK_MESSAGES);
		}
	}, [messages.length]);

	const sendMessage = useCallback(async (message: string, attachments: FileAttachment[] = []) => {
		if (!isMockMode) return;

		const newMessage: ChatMessageUI = {
			id: `msg-${Date.now()}`,
			role: 'user',
			content: message,
			timestamp: Date.now(),
			isUser: true,
			files: attachments
		};

		setMessages(prev => [...prev, newMessage]);

		// Simulate assistant response after a delay
		setTimeout(() => {
			const response: ChatMessageUI = {
				id: `msg-${Date.now() + 1}`,
				role: 'assistant',
				content: `You said: "${message}". This is a mock response.`,
				timestamp: Date.now() + 1000,
				isUser: false,
				files: []
			};
			setMessages(prev => [...prev, response]);
		}, 1000);
	}, [isMockMode]);

	const clearMessages = useCallback(() => {
		setMessages([]);
	}, []);

	const resetToDefault = useCallback(() => {
		setMessages(MOCK_MESSAGES);
	}, []);

	const loadMockSet = useCallback((set: 'default' | 'avatars' | 'files') => {
		switch (set) {
			case 'avatars':
				setMessages(MOCK_MESSAGES_WITH_AVATARS);
				break;
			case 'files':
				setMessages(MOCK_MESSAGES_WITH_FILES);
				break;
			default:
				setMessages(MOCK_MESSAGES);
		}
	}, []);

	return {
		messages,
		sendMessage,
		practiceConfig: MOCK_PRACTICE_CONFIG,
		isMockMode,
		setMockMode: handleSetMockMode,
		clearMessages,
		resetToDefault,
		loadMockSet
	};
};

