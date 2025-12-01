import { FunctionComponent } from 'preact';
import { Avatar } from '../../ui/profile/atoms/Avatar';

interface MessageAvatarProps {
	src?: string | null;
	name: string;
	size?: 'sm' | 'md' | 'lg';
	className?: string;
}

export const MessageAvatar: FunctionComponent<MessageAvatarProps> = ({
	src,
	name,
	size = 'md',
	className = ''
}) => {
	return (
		<div className={`flex-shrink-0 ${className}`}>
			<Avatar src={src} name={name} size={size} />
		</div>
	);
};

