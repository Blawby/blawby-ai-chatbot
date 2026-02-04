import { FunctionComponent, ComponentChildren } from 'preact';

interface MessageBubbleProps {
	isUser: boolean;
	variant?: 'default' | 'compact' | 'detailed';
	hasOnlyMedia?: boolean;
	className?: string;
	children: ComponentChildren;
}

export const MessageBubble: FunctionComponent<MessageBubbleProps> = ({
	isUser,
	variant = 'default',
	hasOnlyMedia = false,
	className = '',
	children
}) => {
	const baseClasses = 'flex flex-col max-w-full break-words relative';
	
	const variantClasses = {
		default: '',
		compact: 'px-2 py-1',
		detailed: 'px-4 py-3'
	};

	const messageLayoutClasses = 'mr-0 ml-0 w-full';

	const mediaOnlyClasses = hasOnlyMedia ? 'p-0 m-0 bg-transparent' : '';

	const classes = [
		baseClasses,
		variantClasses[variant],
		messageLayoutClasses,
		mediaOnlyClasses,
		isUser ? 'text-light-text dark:text-dark-text' : '', // Restore text color for user messages
		className
	].filter(Boolean).join(' ');

	return (
		<div className={classes} data-testid={isUser ? "user-message" : "ai-message"}>
			{children}
		</div>
	);
};
