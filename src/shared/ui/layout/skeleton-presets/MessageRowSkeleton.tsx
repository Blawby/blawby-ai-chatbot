import { SkeletonLoader } from '../SkeletonLoader';

export interface MessageRowSkeletonProps {
  lineWidths: string[];
}

export const MessageRowSkeleton = ({ lineWidths }: MessageRowSkeletonProps) => {
  return (
    <div className="flex items-start gap-3">
      <SkeletonLoader variant="avatar" />
      <div className="space-y-2">
        {lineWidths.map((lineWidth, index) => (
          <SkeletonLoader
            key={`${lineWidth}-${index}`}
            variant="text"
            width={lineWidth}
          />
        ))}
      </div>
    </div>
  );
};
