import { PracticeMattersPage } from '@/features/matters/pages/PracticeMattersPage';
import { ClientMattersPage } from '@/features/matters/pages/ClientMattersPage';

type MattersPreviewVariant = 'practice' | 'client';

type MattersPreviewPageProps = {
  variant?: MattersPreviewVariant;
};

export function MattersPreviewPage({ variant = 'practice' }: MattersPreviewPageProps) {
  const basePath = `/preview/matters/${variant}`;

  return (
    variant === 'practice'
      ? <PracticeMattersPage basePath={basePath} />
      : <ClientMattersPage />
  );
}
