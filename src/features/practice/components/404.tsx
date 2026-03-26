import { Button } from '@/shared/ui/Button';
import { useNavigation } from '@/shared/utils/navigation';

export function App404() {
  const { navigate } = useNavigation();

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-4xl font-semibold text-heading">404</div>
      <div className="text-base text-secondary">The page you&apos;re looking for doesn&apos;t exist.</div>
      <div>
        <Button type="button" variant="primary" onClick={() => navigate('/', true)}>
          Go to Home
        </Button>
      </div>
    </div>
  );
}
