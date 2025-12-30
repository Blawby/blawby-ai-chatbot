import { FunctionComponent } from 'preact';
import { useState } from 'preact/hooks';
import { FileAttachment } from '../../../../worker/types';
import LazyMedia from '@/features/media/components/LazyMedia';
import Modal from '@/shared/components/Modal';
import MediaContent from '@/features/media/components/MediaContent';
import { getDocumentIcon, formatDocumentIconSize } from '@/features/chat/utils/fileUtils';

interface MessageAttachmentsProps {
	files: FileAttachment[];
	className?: string;
}

export const MessageAttachments: FunctionComponent<MessageAttachmentsProps> = ({
	files,
	className = ''
}) => {
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [selectedMedia, setSelectedMedia] = useState<{
		id: string;
		name: string;
		size: number;
		type: string;
		url: string;
		timestamp: Date;
		messageIndex: number;
		category: 'image' | 'video' | 'audio';
	} | null>(null);

	if (files.length === 0) return null;

	const imageFiles = files.filter(file => file.type.startsWith('image/'));
	const audioFiles = files.filter(file => file.type.startsWith('audio/'));
	const videoFiles = files.filter(file => file.type.startsWith('video/'));
	const documentFiles = files.filter(file => 
		!file.type.startsWith('image/') && 
		!file.type.startsWith('audio/') && 
		!file.type.startsWith('video/')
	);

	const handleImageClick = (file: FileAttachment) => {
		setSelectedMedia({
			id: file.url,
			name: file.name,
			size: file.size,
			type: file.type,
			url: file.url,
			timestamp: new Date(),
			messageIndex: 0,
			category: 'image' as const
		});
		setIsModalOpen(true);
	};

	const handleDocumentClick = (file: FileAttachment) => {
		const link = globalThis.document.createElement('a');
		link.href = file.url;
		link.download = file.name;
		link.click();
	};

	const handleKeyDown = (e: globalThis.KeyboardEvent, file: FileAttachment, handler: (file: FileAttachment) => void) => {
		if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
			e.preventDefault();
			handler(file);
		}
	};

	return (
		<div className={className}>
			{/* Images */}
			{imageFiles.map((file, index) => (
				<div key={file.url || index} className="message-media-container my-2">
					<LazyMedia
						src={file.url}
						type={file.type}
						alt={file.name}
						className="max-w-[300px] max-h-[300px] w-auto h-auto block cursor-pointer rounded-lg border border-gray-200 dark:border-gray-700"
						onClick={() => handleImageClick(file)}
					/>
				</div>
			))}

			{/* Documents */}
			{documentFiles.map((file, index) => (
				<div 
					key={`doc-${index}`}
					className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-pointer my-2 max-w-[300px]"
					onClick={() => handleDocumentClick(file)}
					onKeyDown={(e) => handleKeyDown(e, file, handleDocumentClick)}
					role="button"
					tabIndex={0}
					aria-label={`Open ${file.name}`}
				>
					<div className="w-8 h-8 rounded bg-gray-100 dark:bg-dark-hover flex items-center justify-center flex-shrink-0">
						{getDocumentIcon(file)}
					</div>
					<div className="flex-1 min-w-0">
						<div className="text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap overflow-hidden text-ellipsis" title={file.name}>
							{file.name.length > 25 ? `${file.name.substring(0, 25)}...` : file.name}
						</div>
						<div className="text-xs text-gray-500 dark:text-gray-400">{formatDocumentIconSize(file.size)}</div>
					</div>
				</div>
			))}

			{/* Audio */}
			{audioFiles.map((file, index) => (
				<div key={`audio-${index}`} className="my-2 rounded-xl overflow-hidden max-w-75 w-full">
					<LazyMedia
						src={file.url}
						type={file.type}
						alt={file.name}
						className="w-full h-auto block cursor-pointer"
					/>
				</div>
			))}

			{/* Video */}
			{videoFiles.map((file, index) => (
				<div key={`video-${index}`} className="my-2 rounded-xl overflow-hidden max-w-75 w-full">
					<LazyMedia
						src={file.url}
						type={file.type}
						alt={file.name}
						className="w-full h-auto block cursor-pointer"
					/>
				</div>
			))}

			{/* Modal for viewing images */}
			{isModalOpen && selectedMedia && (
				<Modal
					isOpen={isModalOpen}
					onClose={() => {
						setIsModalOpen(false);
						setSelectedMedia(null);
					}}
					type="fullscreen"
					showCloseButton={true}
				>
					<MediaContent media={selectedMedia} />
				</Modal>
			)}
		</div>
	);
};
