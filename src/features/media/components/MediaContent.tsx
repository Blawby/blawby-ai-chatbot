import { FunctionComponent } from 'preact';
import { useState } from 'preact/hooks';
import { Play } from 'lucide-preact';

import { Icon } from '@/shared/ui/Icon';
import { type AggregatedMedia } from '@/shared/utils/mediaAggregation';
import { useUploadPreviewUrl } from '@/features/files/hooks/useUploadPreviewUrl';

interface MediaContentProps {
    media: AggregatedMedia;
}

const MediaContent: FunctionComponent<MediaContentProps> = ({ media }) => {
    const [isVideoPlayIconing, setIsVideoPlayIconing] = useState(false);
    const needsResolve = media.category === 'image' || media.category === 'video';
    const { url: resolvedUrl, isLoading } = useUploadPreviewUrl(
        media.uploadId ?? '',
        media.url || null,
        needsResolve,
    );
    const renderUrl = resolvedUrl ?? media.url ?? '';

    const handleVideoClick = (e: Event) => {
        e.stopPropagation();
        setIsVideoPlayIconing(true);
    };

    const renderMediaContent = () => {
        if (isLoading && !renderUrl) {
            return (
                <div className="flex h-64 w-64 animate-pulse items-center justify-center rounded-r-md bg-paper-2" />
            );
        }
        if (!renderUrl) {
            return (
                <div className="flex h-64 w-64 items-center justify-center rounded-r-md bg-paper-2 text-sm text-dim-2">
                    Preview unavailable
                </div>
            );
        }
        if (media.category === 'video') {
            return (
                <div className="max-w-full max-h-[80vh] rounded-r-md overflow-hidden shadow-2xl">
                    {!isVideoPlayIconing ? (
                        <div
                            className="relative cursor-pointer max-w-full max-h-[80vh]"
                            onClick={handleVideoClick}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleVideoClick(e);
                                }
                            }}
                            role="button"
                            tabIndex={0}
                            aria-label="Play video"
                        >
                            <video
                                src={renderUrl}
                                className="w-full h-auto max-h-[80vh] object-contain"
                                muted
                                playsInline
                            />
                            <div className="absolute inset-0 bg-paper/80 flex flex-col items-center justify-center gap-2">
                                <Icon icon={Play} className="text-accent-ink w-12 h-12"  />
                                <p className="text-accent-ink text-sm font-medium">Click to play</p>
                            </div>
                        </div>
                    ) : (
                        <video
                            src={renderUrl}
                            className="w-full h-auto max-h-[80vh]"
                            controls
                            playsInline
                        >
                            <track kind="captions" src="" label="No captions available" />
                        </video>
                    )}
                </div>
            );
        }

        return (
            <img
                src={renderUrl}
                alt={media.name}
                className="max-w-full max-h-[80vh] object-contain rounded-r-md shadow-2xl cursor-default"
            />
        );
    };

    return (
        <div className="flex flex-col items-center gap-4">
            {renderMediaContent()}
            <div className="text-center">
                <h3 className="text-lg font-semibold mb-1">{media.name}</h3>
                <p className="text-sm opacity-80">
                    {media.type} • {Math.round(media.size / 1024)} KB
                </p>
            </div>
        </div>
    );
};

export default MediaContent;
