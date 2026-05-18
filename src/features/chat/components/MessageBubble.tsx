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
	// `gap-1` puts a 4px breathing room between the author/time header line and
	// the colored bubble (Pencil LymwK / rmTOt), matching the design's stacked
	// layout instead of the prior tight-pack.
	const baseClasses = 'flex min-w-0 flex-col max-w-full break-words relative gap-1';
	
	const variantClasses = {
		default: '',
		compact: 'px-2 py-1',
		detailed: 'px-4 py-3'
	};

	// Sent messages right-align with a content-fit width (Pencil LymwK);
	// received messages keep the original full-width column layout.
	const messageLayoutClasses = isUser ? 'mr-0 ml-auto w-fit max-w-full items-end' : 'mr-0 ml-0 w-full';

	const mediaOnlyClasses = hasOnlyMedia ? 'p-0 m-0 bg-transparent' : '';

	const classes = [
		baseClasses,
		variantClasses[variant],
		messageLayoutClasses,
		mediaOnlyClasses,
		'text-input-text',
		className
	].filter(Boolean).join(' ');

	return (
		<div className={classes} data-testid={isUser ? "user-message" : "ai-message"}>
			{children}
		</div>
	);
};
