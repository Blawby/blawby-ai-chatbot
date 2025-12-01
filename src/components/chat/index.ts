// Chat components - organized in atomic design structure
export { default as ChatContainer } from './ChatContainer';
export { default as ChatMarkdown } from './ChatMarkdown';
export { default as Message } from './Message';
export { default as MessageComposer } from './MessageComposer';
export { default as VirtualMessageList } from './VirtualMessageList';
export { ConversationHeader } from './ConversationHeader';

// Atomic components
export { MessageBubble } from './atoms/MessageBubble';
export { MessageAvatar } from './atoms/MessageAvatar';
export { MessageContent } from './molecules/MessageContent';
export { MessageAttachments } from './molecules/MessageAttachments';
export { MessageActions } from './molecules/MessageActions';

// Utils
export { formatDocumentIconSize, getDocumentIcon } from './utils/fileUtils';

