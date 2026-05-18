import { FilesPageView } from '@/features/files/components/FilesPageView';

interface PracticeFilesPageProps {
  practiceId: string;
  practiceSlug: string;
}

export const PracticeFilesPage = ({ practiceId, practiceSlug }: PracticeFilesPageProps) => (
  <FilesPageView practiceId={practiceId} practiceSlug={practiceSlug} scope="practice" />
);

export default PracticeFilesPage;
