import { MatterFilesPanel } from '@/features/matters/components/files/MatterFilesPanel';

export interface MatterFilesTabProps {
  matterId: string;
}

export const MatterFilesTab = ({ matterId }: MatterFilesTabProps) => (
  <MatterFilesPanel key={`files-${matterId}`} matterId={matterId} />
);
