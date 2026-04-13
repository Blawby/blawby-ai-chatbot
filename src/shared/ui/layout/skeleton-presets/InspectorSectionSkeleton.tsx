import { SkeletonLoader } from '../SkeletonLoader';

export interface InspectorSectionSkeletonProps {
 wideRows: boolean[];
}

export const InspectorSectionSkeleton = ({ wideRows }: InspectorSectionSkeletonProps) => {
 return (
  <>
   {wideRows.map((wide, index) => (
    <div key={index} className="flex items-center justify-between px-4 py-2.5">
     <SkeletonLoader variant="text" width="w-16" />
     <SkeletonLoader variant="text" wide={wide} />
    </div>
   ))}
  </>
 );
};
