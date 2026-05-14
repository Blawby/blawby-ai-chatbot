import { FilesPageView } from '@/features/files/components/FilesPageView';

interface ClientFilesPageProps {
  practiceId: string;
  practiceSlug: string;
  userId: string | null;
}

export const ClientFilesPage = ({ practiceId, practiceSlug, userId }: ClientFilesPageProps) => (
  <FilesPageView practiceId={practiceId} practiceSlug={practiceSlug} scope="client" userId={userId} />
);

export default ClientFilesPage;
