import type { ChatMessageUI } from '../../../../worker/types';

/**
 * Mock chat data for UI development and testing
 * Use this to preview the chat interface while building the backend
 */

export const MOCK_PRACTICE_CONFIG = {
	name: 'Demo Law Practice',
	profileImage: null,
	practiceId: 'demo-practice',
	description: 'A demo practice for UI development'
};

export const MOCK_MESSAGES: ChatMessageUI[] = [
	{
		id: 'msg-1',
		role: 'assistant',
		content: 'Hello! Welcome to the chat interface. This is a demo message from the assistant.',
		timestamp: Date.now() - 300000,
		isUser: false,
		files: []
	},
	{
		id: 'msg-2',
		role: 'user',
		content: 'Hi there! This is a user message. The UI looks great!',
		timestamp: Date.now() - 240000,
		isUser: true,
		files: []
	},
	{
		id: 'msg-3',
		role: 'assistant',
		content: 'Thanks! This is a longer message to test how the chat interface handles multiple lines of text. It should wrap nicely and maintain good readability.',
		timestamp: Date.now() - 180000,
		isUser: false,
		files: []
	},
	{
		id: 'msg-4',
		role: 'user',
		content: 'Can you show me how **markdown** formatting works?',
		timestamp: Date.now() - 120000,
		isUser: true,
		files: []
	},
	{
		id: 'msg-5',
		role: 'assistant',
		content: 'Sure! Here\'s some markdown:\n\n- **Bold text**\n- *Italic text*\n- `Code snippets`\n- # Headers\n\nAnd more!',
		timestamp: Date.now() - 60000,
		isUser: false,
		files: []
	},
	{
		id: 'msg-6',
		role: 'user',
		content: 'Perfect! This mock data is working well for UI development.',
		timestamp: Date.now() - 30000,
		isUser: true,
		files: []
	}
];

export const MOCK_MESSAGES_WITH_AVATARS: ChatMessageUI[] = [
	{
		id: 'msg-1',
		role: 'assistant',
		content: 'Hello! I\'m the assistant with an avatar.',
		timestamp: Date.now() - 300000,
		isUser: false,
		files: [],
		metadata: {
			avatar: {
				src: null,
				name: 'Assistant'
			}
		}
	},
	{
		id: 'msg-2',
		role: 'user',
		content: 'Hi! I\'m a user message with an avatar.',
		timestamp: Date.now() - 240000,
		isUser: true,
		files: [],
		metadata: {
			avatar: {
				src: null,
				name: 'John Doe'
			}
		}
	},
	{
		id: 'msg-3',
		role: 'assistant',
		content: 'This is a longer message to test avatar alignment with multi-line content. The avatar should stay aligned to the top of the message bubble.',
		timestamp: Date.now() - 180000,
		isUser: false,
		files: [],
		metadata: {
			avatar: {
				src: null,
				name: 'Assistant'
			}
		}
	}
];

export const MOCK_MESSAGES_WITH_FILES: ChatMessageUI[] = [
	...MOCK_MESSAGES.slice(0, 2),
	{
		id: 'msg-with-file',
		role: 'user',
		content: 'Here\'s a message with a file attachment',
		timestamp: Date.now() - 120000,
		isUser: true,
		files: [
			{
				id: 'file-1',
				name: 'document.pdf',
				type: 'application/pdf',
				size: 1024000,
				url: 'https://via.placeholder.com/300x400?text=PDF+Document'
			}
		]
	},
	{
		id: 'msg-with-image',
		role: 'assistant',
		content: 'Here\'s an image response',
		timestamp: Date.now() - 60000,
		isUser: false,
		files: [
			{
				id: 'file-2',
				name: 'screenshot.png',
				type: 'image/png',
				size: 512000,
				url: 'https://via.placeholder.com/400x300?text=Image+Attachment'
			}
		]
	}
];

/**
 * Enable mock mode by setting this to true
 * Or use environment variable: VITE_ENABLE_MOCK_CHAT=true
 * 
 * Priority: localStorage > env var > false
 */
export const isMockModeEnabled = (): boolean => {
	// Check localStorage first (allows runtime toggles)
	if (typeof window !== 'undefined') {
		const stored = localStorage.getItem('mockChatEnabled');
		if (stored !== null) {
			return stored === 'true';
		}
	}
	// Fall back to env var (static at build time)
	if (typeof import.meta !== 'undefined' && import.meta.env) {
		return import.meta.env.VITE_ENABLE_MOCK_CHAT === 'true';
	}
	return false;
};

/**
 * Toggle mock mode on/off
 */
export const toggleMockMode = (enabled: boolean): void => {
	if (typeof window !== 'undefined') {
		if (enabled) {
			localStorage.setItem('mockChatEnabled', 'true');
		} else {
			localStorage.removeItem('mockChatEnabled');
		}
	}
};

