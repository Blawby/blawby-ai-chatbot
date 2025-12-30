import { useState } from 'preact/hooks';
import {
  PhotoIcon,
  ArrowDownTrayIcon
} from "@heroicons/react/24/outline";
import { 
  aggregateMediaFromMessages, 
  formatFileSize, 
  // type MediaGroup, // Unused
  type AggregatedMedia 
} from '@/shared/utils/mediaAggregation';
import { getMimeTypeFromFilename } from '@/shared/utils/fileTypeUtils';
import { FileAttachment } from '../../../../worker/types';
import { Button } from '@/shared/ui/Button';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/shared/ui/Accordion';
import { FileCard } from '@/shared/ui/upload/molecules/FileCard';
import Modal from '@/shared/components/Modal';
import MediaContent from './MediaContent';

interface MediaSidebarProps {
  messages: Array<{ files?: FileAttachment[] }>;
}

const categoryLabels = {
  image: 'Photos',
  video: 'Videos',
  document: 'Documents',
  audio: 'Audio',
  other: 'Other Files'
};

export default function MediaSidebar({ messages }: MediaSidebarProps) {
  const [selectedMedia, setSelectedMedia] = useState<AggregatedMedia | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const mediaGroups = aggregateMediaFromMessages(messages);
  const totalDocumentIcons = mediaGroups.reduce((sum, group) => sum + group.files.length, 0);

  const handleMediaClick = (media: AggregatedMedia) => {
    if (media.category === 'image' || media.category === 'video') {
      setSelectedMedia(media);
      setIsModalOpen(true);
    } else {
      // For documents and other files, trigger download
      const link = document.createElement('a');
      link.href = media.url;
      link.download = media.name;
      link.click();
    }
  };

  const handleDownload = (media: AggregatedMedia, e: Event) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = media.url;
    link.download = media.name;
    link.click();
  };

  if (totalDocumentIcons === 0) {
    return (
      <Accordion type="single" collapsible>
        <AccordionItem value="media-section">
          <AccordionTrigger>Media, DocumentIcons, and Links</AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col items-center justify-center text-center py-6">
              <PhotoIcon className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400 dark:text-gray-500 mb-2" />
              <p className="text-xs sm:text-sm lg:text-base font-medium mb-1 text-gray-900 dark:text-white">No files shared yet</p>
              <p className="text-xs sm:text-sm opacity-70 text-gray-500 dark:text-gray-400">DocumentIcons you share in the conversation will appear here</p>
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
                    <h5 className="text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {categoryLabels[group.category]} ({group.files.length})
                    </h5>
                    <div className="flex flex-col gap-2">
                      {group.files.map((media) => {
                        // Convert AggregatedMedia to FileCard format
                        // Prefer the actual MIME type from media.type, fallback to extension-based detection
                        const mimeType = media.type && media.type !== 'application/octet-stream' 
                          ? media.type 
                          : getMimeTypeFromFilename(media.name);
                        
                        const fileForCard = {
                          name: media.name,
                          type: mimeType,
                          size: media.size,
                          url: media.url
                        };

                        return (
                          <div 
                            key={media.id} 
                            role="button"
                            tabIndex={0}
                            className="cursor-pointer transition-transform duration-200 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 rounded-lg"
                            onClick={() => handleMediaClick(media)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleMediaClick(media);
                              }
                            }}
                          >
                            <div className="flex items-center gap-3">
                              {/* Use our atomic FileCard component */}
                              <FileCard
                                fileName={fileForCard.name}
                                mimeType={fileForCard.type}
                                status="preview"
                                imageUrl={media.category === 'image' ? media.url : undefined}
                                size="sm"
                                className="flex-shrink-0"
                              />
                              
                              {/* File info */}
                              <div className="flex-1 min-w-0">
                                <div className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap overflow-hidden text-ellipsis" title={media.name}>
                                  {media.name.length > 20 ? `${media.name.substring(0, 20)}...` : media.name}
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs text-accent-500">{formatFileSize(media.size)}</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => handleDownload(media, e)}
                                    title="Download file"
                                    className="p-1 hover:bg-gray-200 dark:hover:bg-dark-hover rounded transition-colors duration-200"
                                  >
                                    <ArrowDownTrayIcon className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
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
    </>
  );
} 
