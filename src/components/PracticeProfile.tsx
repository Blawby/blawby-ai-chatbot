import { FaceSmileIcon, CheckBadgeIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';

interface PracticeProfileProps {
	name: string;
	profileImage: string | null;
	practiceId: string;
	description?: string | null;
	variant?: 'sidebar' | 'welcome';
	showVerified?: boolean;
}

export default function PracticeProfile({ 
	name, 
	profileImage, 
	practiceId, 
	description,
	variant = 'sidebar',
	showVerified = true,
}: PracticeProfileProps) {
	const { t } = useTranslation('practice');
	const isWelcome = variant === 'welcome';
	
	return (
		<div className={`flex flex-col items-center gap-3 ${variant === 'welcome' ? 'p-6' : 'p-4'}`}>
			{/* Practice Logo */}
			<div className="flex items-center justify-center">
				{profileImage ? (
					<img 
						src={profileImage} 
						alt={t('profile.logoAlt', { name })}
						className={`rounded-lg object-cover ${isWelcome ? 'w-16 h-16' : 'w-12 h-12'}`}
					/>
				) : (
					<div className={`flex items-center justify-center rounded-lg bg-gray-100 dark:bg-dark-hover ${isWelcome ? 'w-16 h-16' : 'w-12 h-12'}`}>
						<FaceSmileIcon className={isWelcome ? "w-12 h-12" : "w-8 h-8"} />
					</div>
				)}
			</div>

			{/* Practice Name with Verified Badge */}
			<div className="flex items-center justify-center gap-2 w-full">
				<h3 className="text-base sm:text-lg lg:text-xl font-semibold text-center m-0 text-gray-900 dark:text-white leading-tight truncate min-w-0" title={name}>{name}</h3>
				{showVerified && variant === 'welcome' && (
					<CheckBadgeIcon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-900 dark:text-white flex-shrink-0" aria-label={t('profile.verified')} title={t('profile.verified')} />
				)}
			</div>

			{/* Practice Slug */}
			<div className="text-center w-full">
				<span className="text-sm sm:text-base lg:text-lg font-medium text-[#d4af37] truncate block" title={t('profile.slug', { id: practiceId })}>@{practiceId}</span>
			</div>

			{/* Onboarding reminder removed in favor of global top banner */}

			{/* Practice Description - Only show for welcome variant */}
			{description && variant === 'welcome' && (
				<div className="text-center">
					<p className="text-gray-700 dark:text-gray-400 text-center text-sm sm:text-base lg:text-lg leading-relaxed max-w-xs mx-auto line-clamp-3">{description}</p>
				</div>
			)}
		</div>
	);
} 
