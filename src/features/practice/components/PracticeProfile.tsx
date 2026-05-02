import { BadgeCheck } from 'lucide-preact';

import { Icon } from '@/shared/ui/Icon';
import { Avatar } from '@/shared/ui/profile';
import { useTranslation } from 'react-i18next';

interface PracticeProfileProps {
	name: string;
	profileImage: string | null;
	practiceSlug: string;
	description?: string | null;
	showVerified?: boolean;
}

export default function PracticeProfile({ 
	name, 
	profileImage, 
	practiceSlug, 
	description,
	showVerified = true,
}: PracticeProfileProps) {
	const { t } = useTranslation('practice');
	
	return (
		<div className="flex flex-col items-center gap-2">
			{/* Practice Logo */}
			<div className="flex items-center justify-center">
				<Avatar 
					src={profileImage} 
					name={name} 
					size="lg" 
					className="w-12 h-12 rounded-xl"
				/>
			</div>

			{/* Practice Name with Verified Badge */}
			<div className="flex items-center justify-center gap-2 w-full">
				<h3 className="text-base sm:text-lg font-semibold text-center m-0 text-input-text leading-tight truncate min-w-0" title={name}>{name}</h3>
				{showVerified && (
					<Icon icon={BadgeCheck} className="w-4 h-4 sm:w-5 sm:h-5 text-accent-500 flex-shrink-0" aria-label={t('profile.verified')} title={t('profile.verified')}  />
				)}
			</div>

			{/* Practice ID */}
			{practiceSlug && (
				<div className="text-center w-full">
					<span className="text-sm font-medium text-accent-500 truncate block" title={t('profile.slug', { slug: practiceSlug })}>@{practiceSlug}</span>
				</div>
			)}

			{/* Onboarding reminder removed in favor of global top banner */}

			{/* Practice Description */}
			{description && (
				<div className="text-center">
					<p
						className="text-input-placeholder text-center leading-relaxed max-w-xs mx-auto line-clamp-3 text-sm"
					>
						{description}
					</p>
				</div>
			)}
		</div>
	);
} 
