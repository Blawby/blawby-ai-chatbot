import { FunctionComponent } from 'preact';
import { useState } from 'preact/hooks';
import { FileAttachment } from '../../../../worker/types';
import LazyMedia from '@/features/media/components/LazyMedia';
import { Fullscreen } from '@/shared/ui/dialog';
import MediaContent from '@/features/media/components/MediaContent';
import { getDocumentIcon, formatDocumentIconSize } from '@/features/chat/utils/fileUtils';
import { useToastContext } from '@/shared/contexts/ToastContext';
import {
  fetchUploadDownloadUrl,
  useUploadPreviewUrl,
} from '@/features/files/hooks/useUploadPreviewUrl';

const fileFallbackUrl = (file: FileAttachment): string => file.url ?? '';

const useResolvedAttachmentUrl = (file: FileAttachment): string => {
  const { url } = useUploadPreviewUrl(file.uploadId ?? '', file.url || null, Boolean(file.uploadId));
  return url ?? fileFallbackUrl(file);
};

interface SelectedMedia {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  timestamp: Date;
  messageIndex: number;
  category: 'image' | 'video' | 'audio';
}

interface ImageAttachmentProps {
  file: FileAttachment;
  onClick: (file: FileAttachment, resolvedUrl: string) => void;
}

const ImageAttachment: FunctionComponent<ImageAttachmentProps> = ({ file, onClick }) => {
  const src = useResolvedAttachmentUrl(file);
  return (
    <div className="message-media-container my-2">
      <LazyMedia
        src={src}
        type={file.type}
        alt={file.name}
        className="max-w-[300px] max-h-[300px] w-auto h-auto block cursor-pointer rounded-xl"
        onClick={() => onClick(file, src)}
      />
    </div>
  );
};

const AudioAttachment: FunctionComponent<{ file: FileAttachment }> = ({ file }) => {
  const src = useResolvedAttachmentUrl(file);
  return (
    <div className="my-2 rounded-xl overflow-hidden max-w-75 w-full">
      <LazyMedia src={src} type={file.type} alt={file.name} className="w-full h-auto block cursor-pointer" />
    </div>
  );
};

const VideoAttachment: FunctionComponent<{ file: FileAttachment }> = ({ file }) => {
  const src = useResolvedAttachmentUrl(file);
  return (
    <div className="my-2 rounded-xl overflow-hidden max-w-75 w-full">
      <LazyMedia src={src} type={file.type} alt={file.name} className="w-full h-auto block cursor-pointer" />
    </div>
  );
};

interface DocumentAttachmentProps {
  file: FileAttachment;
  onError: (message: string) => void;
}

const DocumentAttachment: FunctionComponent<DocumentAttachmentProps> = ({ file, onError }) => {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const url = file.uploadId
        ? await fetchUploadDownloadUrl(file.uploadId)
        : fileFallbackUrl(file);
      if (!url) throw new Error('No download URL is available for this file.');
      const link = globalThis.document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to download file.');
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: globalThis.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      void handleClick();
    }
  };

  return (
    <div
      className="flex items-center gap-2 p-2 rounded-xl panel cursor-pointer my-2 max-w-[300px]"
      onClick={() => { void handleClick(); }}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-busy={busy}
      aria-label={`Open ${file.name}`}
    >
      <div className="w-8 h-8 rounded bg-surface-base flex items-center justify-center flex-shrink-0">
        {getDocumentIcon(file)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink whitespace-nowrap overflow-hidden text-ellipsis" title={file.name}>
          {file.name.length > 25 ? `${file.name.substring(0, 25)}...` : file.name}
        </div>
        <div className="text-xs text-dim-2">{formatDocumentIconSize(file.size)}</div>
      </div>
    </div>
  );
};

interface MessageAttachmentsProps {
	files: FileAttachment[];
	className?: string;
}

export const MessageAttachments: FunctionComponent<MessageAttachmentsProps> = ({
	files,
	className = ''
}) => {
	const { showError } = useToastContext();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(null);

	if (files.length === 0) return null;

	const imageFiles = files.filter(file => file.type.startsWith('image/'));
	const audioFiles = files.filter(file => file.type.startsWith('audio/'));
	const videoFiles = files.filter(file => file.type.startsWith('video/'));
	const documentFiles = files.filter(file =>
		!file.type.startsWith('image/') &&
		!file.type.startsWith('audio/') &&
		!file.type.startsWith('video/')
	);

	const handleImageClick = (file: FileAttachment, resolvedUrl: string) => {
		setSelectedMedia({
			id: resolvedUrl || file.id,
			name: file.name,
			size: file.size,
			type: file.type,
			url: resolvedUrl,
			timestamp: new Date(),
			messageIndex: 0,
			category: 'image',
		});
		setIsModalOpen(true);
	};

	const handleDocumentError = (message: string) => {
		showError('Download failed', message);
	};

	return (
		<div className={className}>
			{imageFiles.map((file, index) => (
				<ImageAttachment key={file.id ?? file.uploadId ?? index} file={file} onClick={handleImageClick} />
			))}

			{documentFiles.map((file, index) => (
				<DocumentAttachment
					key={file.id ?? file.uploadId ?? `doc-${index}`}
					file={file}
					onError={handleDocumentError}
				/>
			))}

			{audioFiles.map((file, index) => (
				<AudioAttachment key={file.id ?? file.uploadId ?? `audio-${index}`} file={file} />
			))}

			{videoFiles.map((file, index) => (
				<VideoAttachment key={file.id ?? file.uploadId ?? `video-${index}`} file={file} />
			))}

			{isModalOpen && selectedMedia && (
				<Fullscreen
					isOpen={isModalOpen}
					onClose={() => {
						setIsModalOpen(false);
						setSelectedMedia(null);
					}}
					showCloseButton={true}
				>
					<MediaContent media={selectedMedia} />
				</Fullscreen>
			)}
		</div>
	);
};
