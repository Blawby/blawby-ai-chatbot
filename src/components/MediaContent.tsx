import { FunctionComponent } from 'preact';
import { useState } from 'preact/hooks';
import { PlayIcon } from '@heroicons/react/24/outline';
import { type AggregatedMedia } from '../utils/mediaAggregation';

interface MediaContentProps {
    media: AggregatedMedia;
}

const MediaContent: FunctionComponent<MediaContentProps> = ({ media }) => {
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);

    const handleVideoClick = (e: Event) => {
        e.stopPropagation();
        setIsVideoPlaying(true);
    };

    const renderMediaContent = () => {
        if (media.category === 'video') {
            return (
                <div className="max-w-full max-h-[80vh] rounded-lg overflow-hidden shadow-2xl">
                    {!isVideoPlaying ? (
                        <div className="relative cursor-pointer max-w-full max-h-[80vh]" onClick={handleVideoClick}>
                            <video 
                                src={media.url} 
                                className="w-full h-auto max-h-[80vh] object-contain"
                                muted
                                playsInline
                            />
                            <div className="absolute inset-0 bg-black bg-opacity-50 flex flex-col items-center justify-center gap-2">
                                <PlayIcon className="text-white w-12 h-12" />
                                <p className="text-white text-sm font-medium">Click to play</p>
                            </div>
                        </div>
                    ) : (
                        <video 
                            src={media.url} 
                            className="w-full h-auto max-h-[80vh]"
                            controls
                            autoPlay
                            playsInline
                        />
                    )}
                </div>
            );
        }

        return (
            <img 
                src={media.url} 
                alt={media.name} 
                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl cursor-default" 
                onClick={(e) => e.stopPropagation()} 
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
