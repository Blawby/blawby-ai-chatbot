import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import type { FileAttachment } from '../../worker/types';
import ConfirmationDialog from '@/shared/components/ConfirmationDialog';
import WelcomeDialog from '@/features/modals/components/WelcomeDialog';
import CameraDialog from '@/features/modals/components/CameraDialog';
import { AppConnectionDialog } from '@/features/settings/components/AppConnectionDialog';
import { mockApps } from '@/features/settings/pages/appsData';
import AuthForm from '@/shared/components/AuthForm';
import { ContactForm, type ContactData } from '@/features/intake/components/ContactForm';
import { ChatDockedAction } from '@/features/chat/components/ChatDockedAction';
import { MessageAttachments } from '@/features/chat/components/MessageAttachments';
import MediaSidebar from '@/features/media/components/MediaSidebar';
import { InvoiceLineItemsForm } from '@/features/invoices/components/InvoiceLineItemsForm';
import { TimeEntriesPanel } from '@/features/matters/components/time-entries/TimeEntriesPanel';
import { MatterMilestonesPanel } from '@/features/matters/components/milestones/MatterMilestonesPanel';
import { MatterNotesPanel } from '@/features/matters/components/notes/MatterNotesPanel';
import { MatterTasksPanel } from '@/features/matters/components/tasks/MatterTasksPanel';
import { MatterExpensesPanel } from '@/features/matters/components/expenses/MatterExpensesPanel';
import type { InvoiceLineItem } from '@/features/matters/types/billing.types';
import type { MatterDetail, MatterOption, TimeEntry, MatterMilestone, MatterNote, MatterTask, MatterExpense } from '@/features/matters/data/matterTypes';
import { Button } from '@/shared/ui/Button';
import { useNavigation } from '@/shared/utils/navigation';
import { Dialog, DialogBody, Fullscreen } from '@/shared/ui/dialog';
import InspectorPanel from '@/shared/ui/inspector/InspectorPanel';

type PreviewId =
  | 'shared-modal'
  | 'shared-fullscreen'
  | 'confirmation'
  | 'welcome'
  | 'camera'
  | 'app-connection'
  | 'invoice-line-items'
  | 'inspector-panel'
  | 'matter-time-entry'
  | 'matter-milestone'
  | 'matter-note'
  | 'matter-task'
  | 'matter-expense'
  | 'message-attachments'
  | 'media-sidebar'
  | 'docked-auth'
  | 'docked-contact';

type DialogInventoryItem = {
  name: string;
  file: string;
  section: 'Shared shell' | 'Feature dialog' | 'Feature panel' | 'Inline launcher' | 'Docked surface';
  usedIn: string[];
  previewId?: PreviewId;
  frameHeight?: number;
};

type DebugDialogsPageProps = {
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

const sampleMatter: MatterDetail = {
  id: 'matter-debug-1',
  title: 'Miles v. Carter',
  clientName: 'Jordan Miles',
  clientId: 'client-debug-1',
  practiceAreaId: 'family-law',
  status: 'active',
  updatedAt: '2026-04-02T12:00:00.000Z',
  createdAt: '2026-03-20T12:00:00.000Z',
  assigneeIds: [],
  description: 'Debug matter for dialog previews.',
  billingType: 'hourly',
  milestones: [],
  tasks: [],
  timeEntries: [],
  expenses: [],
  notes: [],
};

const sampleAssignees: MatterOption[] = [
  { id: 'user-1', name: 'Case Manager' },
  { id: 'user-2', name: 'Lead Attorney' },
];

const inventory: DialogInventoryItem[] = [
  {
    name: 'Dialog',
    file: 'src/shared/ui/dialog/Dialog.tsx',
    section: 'Shared shell',
    usedIn: [
      'src/features/settings/pages/PracticePage.tsx',
      'src/features/settings/pages/AccountPage.tsx',
      'src/features/settings/pages/PracticePricingPage.tsx',
      'src/features/invoices/pages/PracticeInvoiceDetailPage.tsx',
      'src/features/matters/pages/PracticeMattersPage.tsx',
    ],
    previewId: 'shared-modal',
    frameHeight: 420
  },
  {
    name: 'Fullscreen',
    file: 'src/shared/ui/dialog/Fullscreen.tsx',
    section: 'Shared shell',
    usedIn: [
      'src/features/chat/components/MessageAttachments.tsx',
      'src/features/media/components/MediaSidebar.tsx',
      'src/features/media/components/FileMenu.tsx',
    ],
    previewId: 'shared-fullscreen',
    frameHeight: 420
  },
  {
    name: 'ConfirmationDialog',
    file: 'src/shared/components/ConfirmationDialog.tsx',
    section: 'Feature dialog',
    usedIn: [
      'src/features/settings/pages/AccountPage.tsx',
      'src/pages/DebugDialogsPage.tsx',
    ],
    previewId: 'confirmation',
    frameHeight: 520
  },
  {
    name: 'WelcomeDialog',
    file: 'src/features/modals/components/WelcomeDialog.tsx',
    section: 'Feature dialog',
    usedIn: [
      'src/app/MainApp.tsx',
      'src/pages/DebugDialogsPage.tsx',
    ],
    previewId: 'welcome',
    frameHeight: 560
  },
  {
    name: 'AppConnectionDialog',
    file: 'src/features/settings/components/AppConnectionDialog.tsx',
    section: 'Feature dialog',
    usedIn: [
      'src/features/settings/pages/AppDetailPage.tsx',
      'src/pages/DebugDialogsPage.tsx',
    ],
    previewId: 'app-connection',
    frameHeight: 620
  },
  {
    name: 'CameraDialog',
    file: 'src/features/modals/components/CameraDialog.tsx',
    section: 'Feature dialog',
    usedIn: [
      'src/features/media/components/FileMenu.tsx',
      'src/pages/DebugDialogsPage.tsx',
    ],
    previewId: 'camera',
    frameHeight: 520
  },
  {
    name: 'InvoiceLineItemsForm',
    file: 'src/features/invoices/components/InvoiceLineItemsForm.tsx',
    section: 'Feature dialog',
    usedIn: [
      'src/features/invoices/components/InvoiceForm.tsx',
      'src/pages/DebugDialogsPage.tsx',
    ],
    previewId: 'invoice-line-items',
    frameHeight: 640
  },
  {
    name: 'InspectorPanel',
    file: 'src/shared/ui/inspector/InspectorPanel.tsx',
    section: 'Feature panel',
    usedIn: [
      'src/features/chat/pages/WorkspacePage.tsx',
      'src/app/WidgetApp.tsx',
      'src/pages/DebugDialogsPage.tsx',
    ],
    previewId: 'inspector-panel',
    frameHeight: 760
  },
  {
    name: 'TimeEntriesPanel',
    file: 'src/features/matters/components/time-entries/TimeEntriesPanel.tsx',
    section: 'Feature dialog',
    usedIn: [
      'src/features/matters/pages/PracticeMattersPage.tsx',
      'src/pages/DebugMatterPage.tsx',
      'src/pages/DebugDialogsPage.tsx',
    ],
    previewId: 'matter-time-entry',
    frameHeight: 760
  },
  {
    name: 'MatterMilestonesPanel',
    file: 'src/features/matters/components/milestones/MatterMilestonesPanel.tsx',
    section: 'Feature dialog',
    usedIn: [
      'src/features/matters/pages/PracticeMattersPage.tsx',
      'src/pages/DebugDialogsPage.tsx',
    ],
    previewId: 'matter-milestone',
    frameHeight: 760
  },
  {
    name: 'MatterNotesPanel',
    file: 'src/features/matters/components/notes/MatterNotesPanel.tsx',
    section: 'Feature dialog',
    usedIn: [
      'src/pages/DebugDialogsPage.tsx',
    ],
    previewId: 'matter-note',
    frameHeight: 760
  },
  {
    name: 'MatterTasksPanel',
    file: 'src/features/matters/components/tasks/MatterTasksPanel.tsx',
    section: 'Feature dialog',
    usedIn: [
      'src/features/matters/pages/PracticeMattersPage.tsx',
      'src/features/matters/pages/ClientMattersPage.tsx',
      'src/pages/DebugDialogsPage.tsx',
    ],
    previewId: 'matter-task',
    frameHeight: 760
  },
  {
    name: 'MatterExpensesPanel',
    file: 'src/features/matters/components/expenses/MatterExpensesPanel.tsx',
    section: 'Feature dialog',
    usedIn: [
      'src/features/matters/pages/PracticeMattersPage.tsx',
      'src/pages/DebugDialogsPage.tsx',
    ],
    previewId: 'matter-expense',
    frameHeight: 760
  },
  {
    name: 'MessageAttachments',
    file: 'src/features/chat/components/MessageAttachments.tsx',
    section: 'Inline launcher',
    usedIn: [
      'src/features/chat/components/Message.tsx',
      'src/pages/DebugDialogsPage.tsx',
    ],
    previewId: 'message-attachments',
    frameHeight: 460
  },
  {
    name: 'MediaSidebar',
    file: 'src/features/media/components/MediaSidebar.tsx',
    section: 'Inline launcher',
    usedIn: [
      'src/pages/DebugDialogsPage.tsx',
    ],
    previewId: 'media-sidebar',
    frameHeight: 520
  },
  {
    name: 'ChatDockedAction + AuthForm',
    file: 'src/features/chat/components/ChatDockedAction.tsx + src/shared/components/AuthForm.tsx',
    section: 'Docked surface',
    usedIn: [
      'src/features/chat/components/ChatActionCard.tsx',
      'src/pages/AuthPage.tsx',
      'src/pages/AcceptInvitationPage.tsx',
      'src/pages/DebugDialogsPage.tsx',
    ],
    previewId: 'docked-auth',
    frameHeight: 640
  },
  {
    name: 'ChatDockedAction + ContactForm',
    file: 'src/features/chat/components/ChatDockedAction.tsx + src/features/intake/components/ContactForm.tsx',
    section: 'Docked surface',
    usedIn: [
      'src/features/chat/components/ChatActionCard.tsx',
      'src/features/chat/components/WorkspaceSetupSection.tsx',
      'src/pages/DebugDialogsPage.tsx',
    ],
    previewId: 'docked-contact',
    frameHeight: 620
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

function AutoOpenInvoiceLineItems() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);

  useEffect(() => {
    const trigger = hostRef.current?.querySelector<HTMLButtonElement>('button');
    trigger?.click();
  }, []);

  return (
    <div ref={hostRef} className="p-4">
      <InvoiceLineItemsForm
        lineItems={lineItems}
        onChange={setLineItems}
        billingIncrementMinutes={6}
      />
    </div>
  );
}

function clickFirstButton(hostRef: { current: HTMLDivElement | null }) {
  const trigger = hostRef.current?.querySelector<HTMLButtonElement>('button');
  trigger?.click();
}

function AutoOpenTimeEntryDialog() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);

  useEffect(() => {
    clickFirstButton(hostRef);
  }, []);

  return (
    <div ref={hostRef} className="p-4">
      <TimeEntriesPanel
        entries={entries}
        onSaveEntry={(values) => {
          setEntries((prev) => [...prev, {
            id: crypto.randomUUID(),
            startTime: values.startTime,
            endTime: values.endTime,
            description: values.description,
            billable: values.billable,
          }]);
        }}
        onDeleteEntry={(entry) => {
          setEntries((prev) => prev.filter((candidate) => candidate.id !== entry.id));
        }}
      />
    </div>
  );
}

function AutoOpenMilestoneDialog() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [milestones, setMilestones] = useState<MatterMilestone[]>([]);

  useEffect(() => {
    clickFirstButton(hostRef);
  }, []);

  return (
    <div ref={hostRef} className="p-4">
      <MatterMilestonesPanel
        matter={sampleMatter}
        milestones={milestones}
        onCreateMilestone={(values) => setMilestones((prev) => [...prev, { id: crypto.randomUUID(), ...values }])}
        onUpdateMilestone={(milestone, values) => setMilestones((prev) => prev.map((item) => item.id === milestone.id ? { ...item, ...values } : item))}
        onDeleteMilestone={(milestone) => setMilestones((prev) => prev.filter((item) => item.id !== milestone.id))}
      />
    </div>
  );
}

function AutoOpenNoteDialog() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [notes, setNotes] = useState<MatterNote[]>([]);

  useEffect(() => {
    clickFirstButton(hostRef);
  }, []);

  return (
    <div ref={hostRef} className="p-4">
      <MatterNotesPanel
        matter={sampleMatter}
        practiceId="debug-practice"
        notes={notes}
        onCreateNote={(values) => setNotes((prev) => [{
          id: crypto.randomUUID(),
          author: { name: 'Debug User', role: 'Case Manager' },
          content: values.content,
          createdAt: new Date().toISOString(),
        }, ...prev])}
        onUpdateNote={(note, values) => setNotes((prev) => prev.map((item) => item.id === note.id ? { ...item, content: values.content, updatedAt: new Date().toISOString() } : item))}
        onDeleteNote={(note) => setNotes((prev) => prev.filter((item) => item.id !== note.id))}
      />
    </div>
  );
}

function AutoOpenTaskDialog() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [tasks, setTasks] = useState<MatterTask[]>([]);

  useEffect(() => {
    clickFirstButton(hostRef);
  }, []);

  return (
    <div ref={hostRef} className="p-4">
      <MatterTasksPanel
        tasks={tasks}
        assignees={sampleAssignees}
        onCreateTask={async (values) => {
          setTasks((prev) => [...prev, {
            id: crypto.randomUUID(),
            matterId: sampleMatter.id,
            name: values.name,
            description: values.description || null,
            assigneeId: values.assigneeId,
            dueDate: values.dueDate,
            status: values.status,
            priority: values.priority,
            stage: values.stage,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }]);
        }}
        onUpdateTask={async (task, patch) => {
          setTasks((prev) => prev.map((item) => item.id === task.id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item));
        }}
        onDeleteTask={async (task) => {
          setTasks((prev) => prev.filter((item) => item.id !== task.id));
        }}
      />
    </div>
  );
}

function AutoOpenExpenseDialog() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [expenses, setExpenses] = useState<MatterExpense[]>([]);

  useEffect(() => {
    clickFirstButton(hostRef);
  }, []);

  return (
    <div ref={hostRef} className="p-4">
      <MatterExpensesPanel
        matter={sampleMatter}
        expenses={expenses}
        onCreateExpense={(values) => {
          if (values.amount === undefined) return;
          setExpenses((prev) => [{
            id: crypto.randomUUID(),
            description: values.description,
            amount: values.amount,
            date: values.date,
            billable: values.billable,
          }, ...prev]);
        }}
        onUpdateExpense={(expense, values) => {
          if (values.amount === undefined) return;
          setExpenses((prev) => prev.map((item) => item.id === expense.id ? {
            ...item,
            description: values.description,
            amount: values.amount,
            date: values.date,
            billable: values.billable,
          } : item));
        }}
        onDeleteExpense={(expense) => setExpenses((prev) => prev.filter((item) => item.id !== expense.id))}
      />
    </div>
  );
}

function InspectorPanelPreview() {
  const [isOpen, setIsOpen] = useState(true);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="relative min-h-[760px] overflow-hidden rounded-2xl border border-line-glass/20 bg-app">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Inspector preview"
        className="ui-surface-enter-right absolute inset-y-0 right-0 z-10 flex w-full max-w-[min(42rem,100vw)] flex-col overflow-hidden bg-surface-inspector shadow-2xl"
      >
        <InspectorPanel
          entityType="invoice"
          entityId="inv_debug_001"
          practiceId="debug-practice"
          onClose={() => setIsOpen(false)}
          invoiceClientName="Jordan Miles"
          invoiceMatterTitle="Miles v. Carter"
          invoiceStatus="draft"
          invoiceTotal="$1,250.00"
          invoiceAmountDue="$1,250.00"
          invoiceDueDate="Apr 15, 2026"
        />
      </aside>
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

function PreviewSurface({
  children,
  onReplay,
}: {
  children: ComponentChildren;
  onReplay?: () => void;
}) {
  return (
    <main className="min-h-screen bg-app px-3 py-3">
      {onReplay ? (
        <div className="mb-3 flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={onReplay}
            icon={ArrowPathIcon}
            iconClassName="h-4 w-4"
          >
            Replay animation
          </Button>
        </div>
      ) : null}
      {children}
    </main>
  );
}

function PreviewRenderer({ previewId }: { previewId: PreviewId }) {
  const [confirmationResolved, setConfirmationResolved] = useState(false);
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    setIsOpen(true);
    setConfirmationResolved(false);
  }, [previewId]);

  if (previewId === 'confirmation') {
    return (
      <ConfirmationDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
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
    return <WelcomeDialog isOpen={isOpen} onClose={() => setIsOpen(false)} onComplete={() => {}} workspace="practice" />;
  }

  if (previewId === 'camera') {
    return <CameraDialog isOpen={isOpen} onClose={() => setIsOpen(false)} onCapture={() => {}} />;
  }

  if (previewId === 'app-connection') {
    return (
      <AppConnectionDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        app={mockApps[1]}
        onConnect={() => {}}
      />
    );
  }

  if (previewId === 'invoice-line-items') {
    return <AutoOpenInvoiceLineItems />;
  }

  if (previewId === 'inspector-panel') {
    return <InspectorPanelPreview />;
  }

  if (previewId === 'matter-time-entry') {
    return <AutoOpenTimeEntryDialog />;
  }

  if (previewId === 'matter-milestone') {
    return <AutoOpenMilestoneDialog />;
  }

  if (previewId === 'matter-note') {
    return <AutoOpenNoteDialog />;
  }

  if (previewId === 'matter-task') {
    return <AutoOpenTaskDialog />;
  }

  if (previewId === 'matter-expense') {
    return <AutoOpenExpenseDialog />;
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
      : 'fullscreen';

  const content = type === 'fullscreen' ? (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-xl text-center">
        <p className="text-lg font-medium text-input-text">Shared fullscreen shell</p>
        <p className="mt-2 text-sm text-input-placeholder">Used by media and camera flows.</p>
      </div>
    </div>
  ) : (
    <DialogBody className="space-y-3">
      <p className="text-sm text-input-text">Shared shell preview.</p>
      <p className="text-sm text-input-placeholder">No additional feature UI injected.</p>
    </DialogBody>
  );

  if (type === 'fullscreen') {
    return (
      <Fullscreen isOpen={isOpen} onClose={() => setIsOpen(false)}>
        {content}
      </Fullscreen>
    );
  }

  return (
    <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)} title="Shared shell" contentClassName="max-w-xl">
      {content}
    </Dialog>
  );
}

function GalleryCard({ item, previewNonce }: { item: DialogInventoryItem; previewNonce: number }) {
  const frameSrc = item.previewId ? `/debug/dialogs/${item.previewId}` : null;

  return (
    <article className="space-y-3 rounded-2xl border border-line-glass/30 bg-white/[0.02] p-4">
      <div className="space-y-2">
        <h2 className="text-base font-semibold text-input-text">{item.name}</h2>
        <p className="break-all text-xs text-input-placeholder">{item.file}</p>
      </div>
      <div className="space-y-2 text-sm">
        <p className="font-medium text-input-text">Used in</p>
        <ul className="space-y-1 text-input-placeholder">
          {item.usedIn.map((path) => (
            <li key={path} className="break-all font-mono text-xs">
              {path}
            </li>
          ))}
        </ul>
      </div>
      {frameSrc ? (
        <div className="overflow-hidden rounded-xl border border-line-glass/20 bg-app">
          <iframe
            key={`${item.name}-${previewNonce}`}
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

export default function DebugDialogsPage({ previewId }: DebugDialogsPageProps) {
  const { navigate } = useNavigation();
  const [previewNonce, setPreviewNonce] = useState(0);
  const replayAnimations = () => setPreviewNonce((current) => current + 1);

  const previewItem = inventory.find((item) => item.previewId === previewId);

  if (previewId && !previewItem) {
    return (
      <PreviewSurface onReplay={replayAnimations}>
        <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center p-8">
          <div className="w-full rounded-2xl border border-line-glass/30 bg-surface-overlay/80 p-8 text-center shadow-2xl backdrop-blur-xl">
            <p className="text-lg font-semibold text-input-text">Preview not found</p>
            <p className="mt-2 text-sm text-input-placeholder">
              The requested dialog preview does not exist.
            </p>
          </div>
        </div>
      </PreviewSurface>
    );
  }

  if (previewItem?.previewId) {
    return (
      <PreviewSurface onReplay={replayAnimations}>
        <PreviewRenderer key={`${previewItem.previewId}-${previewNonce}`} previewId={previewItem.previewId} />
      </PreviewSurface>
    );
  }

  const sharedShells = inventory.filter((item) => item.section === 'Shared shell');
  const featureDialogs = inventory.filter((item) => item.section === 'Feature dialog');
  const featurePanels = inventory.filter((item) => item.section === 'Feature panel');
  const launcherPatterns = inventory.filter((item) => item.section === 'Inline launcher');
  const dockedSurfaces = inventory.filter((item) => item.section === 'Docked surface');
  return (
    <main className="mx-auto max-w-[1600px] space-y-8 p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-input-text">Debug Dialogs</h1>
            <p className="text-sm text-input-placeholder">
              Side-by-side review of actual dialog implementations and launcher patterns.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={replayAnimations} icon={ArrowPathIcon} iconClassName="h-4 w-4">
              Replay animations
            </Button>
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
          {sharedShells.map((item) => <GalleryCard key={item.name} item={item} previewNonce={previewNonce} />)}
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-medium text-input-text">Feature Dialogs</h2>
          <p className="text-sm text-input-placeholder">Real feature implementations layered on top of the shared shell.</p>
        </div>
        <div className="space-y-4">
          {featureDialogs.map((item) => <GalleryCard key={item.name} item={item} previewNonce={previewNonce} />)}
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-medium text-input-text">Feature Panels</h2>
          <p className="text-sm text-input-placeholder">Right-side panel patterns that are part of the same transient-surface system.</p>
        </div>
        <div className="space-y-4">
          {featurePanels.map((item) => <GalleryCard key={item.name} item={item} previewNonce={previewNonce} />)}
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-medium text-input-text">Launcher Patterns</h2>
          <p className="text-sm text-input-placeholder">Inline components that launch dialog experiences rather than being dialog shells themselves.</p>
        </div>
        <div className="space-y-4">
          {launcherPatterns.map((item) => <GalleryCard key={item.name} item={item} previewNonce={previewNonce} />)}
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-medium text-input-text">Docked Surfaces</h2>
          <p className="text-sm text-input-placeholder">Transient UI that is not a portal dialog but should still align with the shared design system.</p>
        </div>
        <div className="space-y-4">
          {dockedSurfaces.map((item) => <GalleryCard key={item.name} item={item} previewNonce={previewNonce} />)}
        </div>
      </section>

    </main>
  );
}
