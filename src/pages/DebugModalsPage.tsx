import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { FileAttachment } from '../../worker/types';
import Modal from '@/shared/components/Modal';
import ConfirmationDialog from '@/shared/components/ConfirmationDialog';
import WelcomeModal from '@/features/modals/components/WelcomeModal';
import CameraModal from '@/features/modals/components/CameraModal';
import { AppConnectionModal } from '@/features/settings/components/AppConnectionModal';
import { mockApps } from '@/features/settings/pages/appsData';
import AuthForm from '@/shared/components/AuthForm';
import { ContactForm, type ContactData } from '@/features/intake/components/ContactForm';
import { ChatDockedAction } from '@/features/chat/components/ChatDockedAction';
import { MessageAttachments } from '@/features/chat/components/MessageAttachments';
import MediaSidebar from '@/features/media/components/MediaSidebar';
import { Button } from '@/shared/ui/Button';
import { useNavigation } from '@/shared/utils/navigation';

type PreviewId =
  | 'shared-modal'
  | 'shared-drawer'
  | 'shared-drawer-right'
  | 'shared-fullscreen'
  | 'confirmation'
  | 'welcome'
  | 'camera'
  | 'app-connection'
  | 'message-attachments'
  | 'media-sidebar'
  | 'docked-auth'
  | 'docked-contact';

type ModalInventoryItem = {
  name: string;
  file: string;
  role: string;
  usedFor: string;
  simplify: string;
  previewId?: PreviewId;
  frameHeight?: number;
};

type DebugModalsPageProps = {
  previewId?: string;
};

const mockImageUrl =
  `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#3b82f6" offset="0%"/>
          <stop stop-color="#14b8a6" offset="100%"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill="url(#g)"/>
      <circle cx="240" cy="220" r="120" fill="rgba(255,255,255,0.22)"/>
      <circle cx="940" cy="280" r="180" fill="rgba(255,255,255,0.14)"/>
      <rect x="120" y="600" width="960" height="120" rx="28" fill="rgba(255,255,255,0.14)"/>
      <text x="120" y="160" fill="white" font-size="56" font-family="Arial, sans-serif">Mock attachment preview</text>
    </svg>
  `)}`;

const mockPdfUrl =
  `data:text/plain;charset=utf-8,${encodeURIComponent('Mock document download')}`;

const mockFiles: FileAttachment[] = [
  {
    id: 'file-1',
    name: 'intake-summary.png',
    size: 182_400,
    type: 'image/png',
    url: mockImageUrl
  },
  {
    id: 'file-2',
    name: 'signed-engagement-letter.pdf',
    size: 248_000,
    type: 'application/pdf',
    url: mockPdfUrl
  }
];

const inventory: ModalInventoryItem[] = [
  {
    name: 'Modal',
    file: 'src/shared/components/Modal.tsx',
    role: 'Shared shell',
    usedFor: 'Base centered dialog container.',
    simplify: 'Split shell variants into smaller primitives instead of one component handling every mode.',
    previewId: 'shared-modal',
    frameHeight: 420
  },
  {
    name: 'Modal drawer',
    file: 'src/shared/components/Modal.tsx',
    role: 'Shared shell',
    usedFor: 'Bottom sheet container.',
    simplify: 'Keep bottom-sheet behavior separate from centered dialog behavior.',
    previewId: 'shared-drawer',
    frameHeight: 520
  },
  {
    name: 'Modal right drawer',
    file: 'src/shared/components/Modal.tsx',
    role: 'Shared shell',
    usedFor: 'Right-side drawer for inspector/detail flows.',
    simplify: 'This could be its own drawer primitive instead of a branch inside the base modal.',
    previewId: 'shared-drawer-right',
    frameHeight: 520
  },
  {
    name: 'Modal fullscreen',
    file: 'src/shared/components/Modal.tsx',
    role: 'Shared shell',
    usedFor: 'Fullscreen takeover used by media and capture flows.',
    simplify: 'Treat fullscreen as its own primitive with a dedicated layout contract.',
    previewId: 'shared-fullscreen',
    frameHeight: 420
  },
  {
    name: 'ConfirmationDialog',
    file: 'src/shared/components/ConfirmationDialog.tsx',
    role: 'Feature modal',
    usedFor: 'Destructive confirmation with typed confirmation and submit flow.',
    simplify: 'Good candidate for a single shared destructive-dialog pattern.',
    previewId: 'confirmation',
    frameHeight: 520
  },
  {
    name: 'WelcomeModal',
    file: 'src/features/modals/components/WelcomeModal.tsx',
    role: 'Feature modal',
    usedFor: 'Welcome and onboarding modal.',
    simplify: 'Feature content is already reasonably separate from the modal shell.',
    previewId: 'welcome',
    frameHeight: 560
  },
  {
    name: 'AppConnectionModal',
    file: 'src/features/settings/components/AppConnectionModal.tsx',
    role: 'Feature modal',
    usedFor: 'App/integration connection modal from settings.',
    simplify: 'Focus management and shell responsibilities could be shared instead of reimplemented here.',
    previewId: 'app-connection',
    frameHeight: 620
  },
  {
    name: 'CameraModal',
    file: 'src/features/modals/components/CameraModal.tsx',
    role: 'Feature modal',
    usedFor: 'Camera capture modal.',
    simplify: 'Capture logic should stay separate, but the fullscreen host can be standardized.',
    previewId: 'camera',
    frameHeight: 520
  },
  {
    name: 'MessageAttachments',
    file: 'src/features/chat/components/MessageAttachments.tsx',
    role: 'Inline launcher',
    usedFor: 'Inline attachments list that opens the fullscreen media viewer.',
    simplify: 'Separate launchers from the shared fullscreen media viewer they open.',
    previewId: 'message-attachments',
    frameHeight: 460
  },
  {
    name: 'MediaSidebar',
    file: 'src/features/media/components/MediaSidebar.tsx',
    role: 'Inline launcher',
    usedFor: 'Sidebar media list that opens the fullscreen media viewer.',
    simplify: 'Another launcher into the same viewer pattern, so it is a strong consolidation target.',
    previewId: 'media-sidebar',
    frameHeight: 520
  },
  {
    name: 'ChatDockedAction + AuthForm',
    file: 'src/features/chat/components/ChatDockedAction.tsx + src/shared/components/AuthForm.tsx',
    role: 'Docked surface',
    usedFor: 'Chat auth prompt shown as a docked panel, not a portal modal.',
    simplify: 'Useful for consolidating shared spacing, headers, and action-surface patterns across non-modal transient UI.',
    previewId: 'docked-auth',
    frameHeight: 640
  },
  {
    name: 'ChatDockedAction + ContactForm',
    file: 'src/features/chat/components/ChatDockedAction.tsx + src/features/intake/components/ContactForm.tsx',
    role: 'Docked surface',
    usedFor: 'Slim contact form shown as a docked panel in chat, not a portal modal.',
    simplify: 'This should align visually with modal forms where appropriate, but remain a distinct container pattern.',
    previewId: 'docked-contact',
    frameHeight: 620
  },
  {
    name: 'MatterCreateModal / MatterCreateForm',
    file: 'src/features/matters/components/MatterCreateModal.tsx',
    role: 'Form content',
    usedFor: 'Create-matter form content. In actual implementation this is page-hosted, not a modal shell.',
    simplify: 'Keep this content separate and standardize the host pattern around it.'
  },
  {
    name: 'LinkMatterModal',
    file: 'src/features/chat/components/LinkMatterModal.tsx',
    role: 'Feature modal',
    usedFor: 'Attach or change a matter linked to a conversation.',
    simplify: 'Needs service/data separation before it becomes easy to preview and reuse cleanly.'
  },
  {
    name: 'InspectorPanel',
    file: 'src/shared/ui/inspector/InspectorPanel.tsx',
    role: 'Page-owned drawer',
    usedFor: 'Right-side inspector flow.',
    simplify: 'Likely wants a dedicated drawer primitive and a slimmer page-owned content layer.'
  },
  {
    name: 'PracticeMattersPage',
    file: 'src/features/matters/pages/PracticeMattersPage.tsx',
    role: 'Page-owned launchers',
    usedFor: 'Page-level flows that launch several dialog/content patterns.',
    simplify: 'The page should launch smaller standardized primitives instead of owning many modal flavors.'
  }
];

function AutoOpenMessageAttachments() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const button = hostRef.current?.querySelector<HTMLElement>('.message-media-container img, .message-media-container video');
    button?.click();
  }, []);

  return (
    <div ref={hostRef} className="p-4">
      <MessageAttachments files={mockFiles} />
    </div>
  );
}

function AutoOpenMediaSidebar() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const trigger = hostRef.current?.querySelector<HTMLElement>('[data-slot="accordion-trigger"], button');
    trigger?.click();
    requestAnimationFrame(() => {
      const mediaRow = hostRef.current?.querySelector<HTMLElement>('[role="button"][tabindex="0"]');
      mediaRow?.click();
    });
  }, []);

  return (
    <div ref={hostRef} className="p-4">
      <MediaSidebar messages={[{ files: mockFiles }]} />
    </div>
  );
}

function DockedAuthPreview() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');

  return (
    <div className="p-4">
      <ChatDockedAction
        isOpen
        title={mode === 'signup' ? 'Sign up' : 'Sign in'}
        description={mode === 'signup' ? 'Create an account to get started' : 'Welcome back — please sign in'}
        onClose={() => {}}
      >
        <AuthForm
          mode={mode}
          defaultMode="signup"
          onModeChange={setMode}
          initialEmail="demo@blawby.test"
          initialName="Demo User"
          showHeader={false}
          variant="plain"
        />
      </ChatDockedAction>
    </div>
  );
}

function DockedContactPreview() {
  const initialValues: ContactData = {
    name: 'Jordan Miles',
    email: 'jordan@example.com',
    phone: '(555) 123-9876'
  };

  return (
    <div className="p-4">
      <ChatDockedAction
        isOpen
        title="Request Consultation"
        description="Provide your contact details"
        onClose={() => {}}
      >
        <ContactForm
          onSubmit={() => {}}
          fields={['name', 'email', 'phone']}
          required={['name', 'email', 'phone']}
          initialValues={initialValues}
          variant="plain"
          showSubmitButton
          submitFullWidth
          submitLabel="Continue"
        />
      </ChatDockedAction>
    </div>
  );
}

function PreviewSurface({ children }: { children: ComponentChildren }) {
  return (
    <main className="min-h-screen bg-app px-4 py-4">
      {children}
    </main>
  );
}

function PreviewRenderer({ previewId }: { previewId: PreviewId }) {
  const [confirmationResolved, setConfirmationResolved] = useState(false);

  if (previewId === 'confirmation') {
    return (
      <ConfirmationDialog
        isOpen
        onClose={() => {}}
        onConfirm={async () => {
          setConfirmationResolved(true);
        }}
        title="Archive intake configuration"
        description="Preview of the destructive confirmation flow."
        confirmText={confirmationResolved ? 'Archived' : 'Archive'}
        confirmationValue="ARCHIVE"
        confirmationLabel="Type this text to continue:"
        warningItems={[
          'Automation rules connected to this intake',
          'Saved draft responses attached to the intake flow',
          'The current public intake entry point'
        ]}
        showSuccessMessage={confirmationResolved}
        successMessage={{
          title: 'Preview completed',
          body: 'Confirmation dialog success state.'
        }}
      />
    );
  }

  if (previewId === 'welcome') {
    return <WelcomeModal isOpen onClose={() => {}} onComplete={() => {}} workspace="practice" />;
  }

  if (previewId === 'camera') {
    return <CameraModal isOpen onClose={() => {}} onCapture={() => {}} />;
  }

  if (previewId === 'app-connection') {
    return (
      <AppConnectionModal
        isOpen
        onClose={() => {}}
        app={mockApps[1]}
        onConnect={() => {}}
      />
    );
  }

  if (previewId === 'message-attachments') {
    return <AutoOpenMessageAttachments />;
  }

  if (previewId === 'media-sidebar') {
    return <AutoOpenMediaSidebar />;
  }

  if (previewId === 'docked-auth') {
    return <DockedAuthPreview />;
  }

  if (previewId === 'docked-contact') {
    return <DockedContactPreview />;
  }

  const type =
    previewId === 'shared-modal'
      ? 'modal'
      : previewId === 'shared-drawer'
        ? 'drawer'
        : previewId === 'shared-drawer-right'
          ? 'drawer-right'
          : 'fullscreen';

  return (
    <Modal
      isOpen
      onClose={() => {}}
      title={type === 'fullscreen' ? undefined : 'Shared shell'}
      type={type}
      bodyClassName={type === 'fullscreen' ? 'p-0' : undefined}
      contentClassName={type === 'modal' ? 'max-w-2xl' : type === 'drawer-right' ? 'max-w-2xl' : undefined}
      disableBackdropClick
    >
      {type === 'fullscreen' ? (
        <div className="flex min-h-screen items-center justify-center p-8">
          <div className="max-w-xl text-center">
            <p className="text-lg font-medium text-input-text">Shared fullscreen shell</p>
            <p className="mt-2 text-sm text-input-placeholder">Used by media and camera flows.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-input-text">Shared shell preview.</p>
          <p className="text-sm text-input-placeholder">No additional feature UI injected.</p>
        </div>
      )}
    </Modal>
  );
}

function GalleryCard({ item }: { item: ModalInventoryItem }) {
  const frameSrc = item.previewId ? `/debug/modals/${item.previewId}` : null;

  return (
    <article className="space-y-3 rounded-2xl border border-line-glass/30 bg-white/[0.02] p-4">
      <div className="space-y-2">
        <h2 className="text-base font-semibold text-input-text">{item.name}</h2>
        <p className="break-all text-xs text-input-placeholder">{item.file}</p>
      </div>
      <dl className="grid gap-3 text-sm md:grid-cols-[140px_1fr]">
        <dt className="font-medium text-input-text">Role</dt>
        <dd className="text-input-placeholder">{item.role}</dd>
        <dt className="font-medium text-input-text">Used for</dt>
        <dd className="text-input-placeholder">{item.usedFor}</dd>
        <dt className="font-medium text-input-text">Simplify</dt>
        <dd className="text-input-placeholder">{item.simplify}</dd>
      </dl>
      {frameSrc ? (
        <div className="overflow-hidden rounded-xl border border-line-glass/20 bg-app">
          <iframe
            title={`${item.name} preview`}
            src={frameSrc}
            className="block w-full border-0 bg-app"
            style={{ height: `${item.frameHeight ?? 480}px` }}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-line-glass/20 px-4 py-6 text-sm text-input-placeholder">
          No side-by-side preview yet.
        </div>
      )}
    </article>
  );
}

export default function DebugModalsPage({ previewId }: DebugModalsPageProps) {
  const { navigate } = useNavigation();

  const previewItem = useMemo(
    () => inventory.find((item) => item.previewId === previewId),
    [previewId]
  );

  if (previewId && previewItem?.previewId) {
    return (
      <PreviewSurface>
        <PreviewRenderer previewId={previewItem.previewId} />
      </PreviewSurface>
    );
  }

  const sharedShells = inventory.filter((item) => item.role === 'Shared shell');
  const featureModals = inventory.filter((item) => item.role === 'Feature modal');
  const launcherPatterns = inventory.filter((item) => item.role === 'Inline launcher');
  const dockedSurfaces = inventory.filter((item) => item.role === 'Docked surface');
  const relatedPatterns = inventory.filter((item) => item.role === 'Form content' || item.role === 'Page-owned drawer' || item.role === 'Page-owned launchers');

  return (
    <main className="mx-auto max-w-[1600px] space-y-8 p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-input-text">Debug Modals</h1>
            <p className="text-sm text-input-placeholder">
              Side-by-side review of actual modal implementations and launcher patterns.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate('/debug/styles')}>
              Styles
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/debug/matters')}>
              Matters
            </Button>
          </div>
        </div>
      </header>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-medium text-input-text">Shared Shells</h2>
          <p className="text-sm text-input-placeholder">Core container patterns. Review these first if the goal is consolidation.</p>
        </div>
        <div className="space-y-4">
          {sharedShells.map((item) => <GalleryCard key={item.name} item={item} />)}
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-medium text-input-text">Feature Modals</h2>
          <p className="text-sm text-input-placeholder">Real feature implementations layered on top of the shared shell.</p>
        </div>
        <div className="space-y-4">
          {featureModals.map((item) => <GalleryCard key={item.name} item={item} />)}
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-medium text-input-text">Launcher Patterns</h2>
          <p className="text-sm text-input-placeholder">Inline components that launch modal experiences rather than being modal shells themselves.</p>
        </div>
        <div className="space-y-4">
          {launcherPatterns.map((item) => <GalleryCard key={item.name} item={item} />)}
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-medium text-input-text">Docked Surfaces</h2>
          <p className="text-sm text-input-placeholder">Transient UI that is not a portal modal but should still align with the shared design system.</p>
        </div>
        <div className="space-y-4">
          {dockedSurfaces.map((item) => <GalleryCard key={item.name} item={item} />)}
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-medium text-input-text">Related Patterns</h2>
          <p className="text-sm text-input-placeholder">Important adjacent pieces that affect a modal refactor but are not straightforward modal previews.</p>
        </div>
        <div className="space-y-4">
          {relatedPatterns.map((item) => <GalleryCard key={item.name} item={item} />)}
        </div>
      </section>
    </main>
  );
}
