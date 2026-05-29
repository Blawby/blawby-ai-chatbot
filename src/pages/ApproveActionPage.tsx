import { ShieldCheck } from 'lucide-preact';
import { Button } from '@/shared/ui/Button';
import { Alert } from '@/shared/ui/feedback/Alert';
import { Icon } from '@/shared/ui/Icon';
import { useNavigation } from '@/shared/utils/navigation';

/**
 * Approval link shell for agent money-actions (`/approve/:jwt`).
 *
 * The real approve/reject flow — decoding the signed token, showing the pending
 * action, and executing it — depends on backend pending-action contracts in
 * Blawby/blawby-backend#282. This shell exists so the route resolves to a safe,
 * honest state instead of a 404, and is intentionally inert: it neither decodes
 * nor acts on the token.
 */
export default function ApproveActionPage({ jwt }: { jwt?: string }) {
  const { navigate } = useNavigation();
  const hasToken = Boolean(jwt && jwt.trim());

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-line-subtle bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-line-subtle bg-paper-2/10">
          <Icon icon={ShieldCheck} className="h-6 w-6 text-ink" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold text-ink">Approval request</h1>
        <p className="mt-2 text-sm text-dim-2">
          Action approvals aren&apos;t available yet. This unlocks once MCP server support and pending-action
          handling are enabled for your practice.
        </p>

        {hasToken ? (
          <p className="mt-3 text-xs text-dim-2">An approval token was received.</p>
        ) : (
          <Alert variant="warning" className="mt-4">
            This approval link is missing its token.
          </Alert>
        )}

        <Button variant="primary" className="mt-6 w-full" onClick={() => navigate('/')}>
          Return to Blawby
        </Button>
      </div>
    </div>
  );
}
