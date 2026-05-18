import { FunctionComponent } from 'preact';
import { useState } from 'preact/hooks';
import { Image, Download } from 'lucide-preact';

import { Icon } from '@/shared/ui/Icon';
import {
  aggregateMediaFromMessages,
  formatFileSize,
  type AggregatedMedia,
} from '@/shared/utils/mediaAggregation';
import { getMimeTypeFromFilename, isImageFile } from '@/shared/utils/fileTypeUtils';
import { FileAttachment } from '../../../../worker/types';
import { Button } from '@/shared/ui/Button';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/shared/ui/Accordion';
import { FileCard } from '@/shared/ui/upload/molecules/FileCard';
import { Fullscreen } from '@/shared/ui/dialog';
import { useToastContext } from '@/shared/contexts/ToastContext';
import {
  fetchUploadDownloadUrl,
  useUploadPreviewUrl,
} from '@/features/files/hooks/useUploadPreviewUrl';
import MediaContent from './MediaContent';

interface MediaSidebarProps {
  messages: Array<{ files?: FileAttachment[] }>;
}

const categoryLabels = {
  image: 'Photos',
  video: 'Videos',
  document: 'Documents',
  audio: 'Audio',
  other: 'Other Files',
};

const resolveMimeType = (media: AggregatedMedia): string => (
  media.type && media.type !== 'application/octet-stream'
    ? media.type
    : getMimeTypeFromFilename(media.name)
);

const downloadFromUrl = (url: string, name: string) => {
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
};

interface MediaRowProps {
  media: AggregatedMedia;
  onPreview: (media: AggregatedMedia, resolvedUrl: string) => void;
  onError: (message: string) => void;
}

const MediaRow: FunctionComponent<MediaRowProps> = ({ media, onPreview, onError }) => {
  const mimeType = resolveMimeType(media);
  const shouldResolveForRender = isImageFile(mimeType) && media.category === 'image';
  const { url: resolvedUrl } = useUploadPreviewUrl(
    media.uploadId ?? '',
    media.url || null,
    shouldResolveForRender && Boolean(media.uploadId || media.url),
  );
  const [busy, setBusy] = useState(false);

  const resolveAction = async (): Promise<string | null> => {
    if (resolvedUrl) return resolvedUrl;
    if (media.uploadId) return fetchUploadDownloadUrl(media.uploadId);
    if (media.url) return media.url;
    return null;
  };

  const handleActivate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const url = await resolveAction();
      if (!url) throw new Error('No download URL is available for this file.');
      if (media.category === 'image' || media.category === 'video') {
        onPreview(media, url);
      } else {
        downloadFromUrl(url, media.name);
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to open file.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async (e: Event) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const url = await resolveAction();
      if (!url) throw new Error('No download URL is available for this file.');
      downloadFromUrl(url, media.name);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to download file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-busy={busy}
      className="cursor-pointer transition-all duration-200 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-accent-500/50 rounded-xl"
      onClick={() => { void handleActivate(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void handleActivate();
        }
      }}
    >
      <div className="flex items-center gap-3">
        <FileCard
          fileName={media.name}
          mimeType={mimeType}
          status="preview"
          imageUrl={media.category === 'image' ? (resolvedUrl ?? undefined) : undefined}
          size="sm"
          className="flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div
            className="text-xs sm:text-sm font-medium text-input-text whitespace-nowrap overflow-hidden text-ellipsis"
            title={media.name}
          >
            {media.name.length > 20 ? `${media.name.substring(0, 20)}...` : media.name}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-accent-500">{formatFileSize(media.size)}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { void handleDownload(e); }}
              title="Download file"
              disabled={busy}
              className="p-1.5 surface-hover rounded-xl text-input-placeholder hover:text-input-text"
            >
              <Icon icon={Download} className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function MediaSidebar({ messages }: MediaSidebarProps) {
  const { showError } = useToastContext();
  const [selectedMedia, setSelectedMedia] = useState<AggregatedMedia | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const mediaGroups = aggregateMediaFromMessages(messages);
  const totalDocumentIcons = mediaGroups.reduce((sum, group) => sum + group.files.length, 0);

  const handlePreview = (media: AggregatedMedia, resolvedUrl: string) => {
    setSelectedMedia({ ...media, url: resolvedUrl });
    setIsModalOpen(true);
  };

  const handleError = (message: string) => {
    showError('File error', message);
  };

  if (totalDocumentIcons === 0) {
    return (
      <Accordion type="single" collapsible>
        <AccordionItem value="media-section">
          <AccordionTrigger>Media, DocumentIcons, and Links</AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col items-center justify-center text-center py-6">
              <Icon icon={Image} className="w-6 h-6 sm:w-8 sm:h-8 text-input-placeholder/50 mb-2" />
              <p className="text-sm font-medium mb-1 text-input-text">No files shared yet</p>
              <p className="text-xs text-input-placeholder">Files you share in the conversation will appear here</p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  }

  return (
    <>
      <Accordion type="single" collapsible>
        <AccordionItem value="media-section">
          <AccordionTrigger>Media, DocumentIcons, and Links ({totalDocumentIcons})</AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 pt-2">
                {mediaGroups.map((group) => (
                  <div key={group.category} className="flex flex-col gap-2">
                    <h5 className="text-[10px] font-bold text-input-placeholder uppercase tracking-[0.2em]">
                      {categoryLabels[group.category]} ({group.files.length})
                    </h5>
                    <div className="flex flex-col gap-2">
                      {group.files.map((media) => (
                        <MediaRow
                          key={media.id}
                          media={media}
                          onPreview={handlePreview}
                          onError={handleError}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Modal for viewing images and videos */}
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
    </>
  );
}
