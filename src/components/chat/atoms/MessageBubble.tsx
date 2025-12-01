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
	const baseClasses = 'flex flex-col max-w-full my-4 px-3 py-2 rounded-xl break-words relative';
	
	const variantClasses = {
		default: '',
		compact: 'my-2 px-2 py-1',
		detailed: 'my-4 px-4 py-3'
	};

	const userClasses = isUser
		? 'ml-auto mr-0 bg-light-message-bg-user dark:bg-dark-message-bg-user text-light-text dark:text-dark-text w-fit'
		: 'mr-0 ml-0 w-full min-h-12 min-w-30';

	const mediaOnlyClasses = hasOnlyMedia ? 'p-0 m-0 bg-none' : '';

	const classes = [
		baseClasses,
		variantClasses[variant],
		userClasses,
		mediaOnlyClasses,
		className
	].filter(Boolean).join(' ');

	return (
		<div className={classes} data-testid={isUser ? "user-message" : "ai-message"}>
			{children}
		</div>
	);
};

