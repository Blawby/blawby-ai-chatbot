import { useMemo, useState } from 'preact/hooks';
import { ulid } from 'ulid';
import { Button } from '@/shared/ui/Button';
import { MatterCreateForm, type MatterFormState } from '@/features/matters/components/MatterCreateModal';
import { MatterListItem } from '@/features/matters/components/MatterListItem';
import { MatterDetailHeader } from '@/features/matters/components/MatterDetailHeader';
import { MatterDetailsPanel } from '@/features/matters/components/MatterDetailPanel';
import { MatterSummaryCards } from '@/features/matters/components/MatterSummaryCards';
import { TimeEntriesPanel } from '@/features/matters/components/time-entries/TimeEntriesPanel';
import { MarkdownUploadTextarea } from '@/shared/ui/input/MarkdownUploadTextarea';
import { ActivityTimeline, type TimelineItem } from '@/shared/ui/activity/ActivityTimeline';
import { asMajor } from '@/shared/utils/money';
import type { MatterDetail, MatterOption, MatterSummary, TimeEntry } from '@/features/matters/data/matterTypes';
import type { MatterStatus } from '@/shared/types/matterStatus';
import type { TimeEntryFormValues } from '@/features/matters/components/time-entries/TimeEntryForm';
import { PencilIcon } from '@heroicons/react/24/outline';

type DebugTab = 'overview' | 'time' | 'messages' | 'activity';
type EditorState = 'none' | 'create';

const clientOptions: MatterOption[] = [
  { id: 'client-a', name: 'Acme LLC', email: 'ops@acme.example', status: 'active', location: 'Los Angeles, CA' },
  { id: 'client-b', name: 'Sierra Health Group', email: 'admin@sierra.example', status: 'active', location: 'San Diego, CA' },
  { id: 'client-c', name: 'Jordan Miles', email: 'jordan@example.com', status: 'lead', location: 'Pasadena, CA' }
];

const practiceAreaOptions: MatterOption[] = [
  { id: 'contracts', name: 'Contract Review' },
  { id: 'litigation', name: 'Civil Litigation' },
  { id: 'employment', name: 'Employment Law' }
];

const assigneeOptions: MatterOption[] = [
  { id: 'attorney-1', name: 'Alex Rivera', role: 'Lead Attorney' },
  { id: 'attorney-2', name: 'Morgan Lee', role: 'Partner' },
  { id: 'staff-1', name: 'Taylor Kim', role: 'Paralegal' }
];

const initialDetails: MatterDetail[] = [
  {
    id: 'matter-1',
    title: 'Vendor Contract Negotiation',
    clientName: 'Acme LLC',
    clientId: 'client-a',
    practiceArea: 'Contract Review',
    practiceAreaId: 'contracts',
    status: 'active',
    updatedAt: '2026-02-18T14:20:00.000Z',
    createdAt: '2026-01-10T12:00:00.000Z',
    assigneeIds: ['attorney-1', 'staff-1'],
    description: 'Negotiate and finalize a three-year services agreement with key procurement protections.',
    billingType: 'hourly',
    attorneyHourlyRate: asMajor(325),
    adminHourlyRate: asMajor(120),
    milestones: [
      { id: 'm-1', description: 'Redline round one', dueDate: '2026-02-22', amount: asMajor(2000), status: 'in_progress' },
      { id: 'm-2', description: 'Final signature package', dueDate: '2026-02-28', amount: asMajor(1200), status: 'pending' }
    ],
    expenses: [
      { id: 'e-1', description: 'State filing fee', amount: asMajor(85), date: '2026-02-12', billable: true }
    ],
    timeEntries: [
      { id: 't-1', startTime: '2026-02-18T16:00:00.000Z', endTime: '2026-02-18T17:30:00.000Z', description: 'Draft revision and risk notes' },
      { id: 't-2', startTime: '2026-02-17T15:00:00.000Z', endTime: '2026-02-17T16:00:00.000Z', description: 'Client call and negotiation plan' }
    ]
  },
  {
    id: 'matter-2',
    title: 'Employment Claim Response',
    clientName: 'Sierra Health Group',
    clientId: 'client-b',
    practiceArea: 'Employment Law',
    practiceAreaId: 'employment',
    status: 'intake_pending',
    updatedAt: '2026-02-16T10:30:00.000Z',
    createdAt: '2026-02-01T09:00:00.000Z',
    assigneeIds: ['attorney-2'],
    description: 'Initial response strategy and supporting documentation for a wage-and-hour claim.',
    billingType: 'fixed',
    paymentFrequency: 'project',
    totalFixedPrice: asMajor(5000),
    milestones: [
      { id: 'm-3', description: 'Collect HR records', dueDate: '2026-02-24', amount: asMajor(1500), status: 'pending' }
    ],
    expenses: [],
    timeEntries: []
  },
  {
    id: 'matter-3',
    title: 'Pre-Litigation Demand Review',
    clientName: 'Jordan Miles',
    clientId: 'client-c',
    practiceArea: 'Civil Litigation',
    practiceAreaId: 'litigation',
    status: 'first_contact',
    updatedAt: '2026-02-15T08:15:00.000Z',
    createdAt: '2026-02-14T08:15:00.000Z',
    assigneeIds: [],
    description: 'Assess legal exposure and draft demand-response options before filing.',
    billingType: 'contingency',
    contingencyPercent: 30,
    milestones: [],
    expenses: [],
    timeEntries: []
  }
];

const detailTabs: Array<{ id: DebugTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'time', label: 'Billing' },
  { id: 'messages', label: 'Messages' },
  { id: 'activity', label: 'Activity' }
];

const toSummary = (detail: MatterDetail): MatterSummary => ({
  id: detail.id,
  title: detail.title,
  clientName: detail.clientName,
  practiceArea: detail.practiceArea,
  status: detail.status,
  updatedAt: detail.updatedAt,
  createdAt: detail.createdAt
});

const nowIso = () => new Date().toISOString();

const normalizeOptional = (value?: string) => (value?.trim() ? value.trim() : undefined);

const buildDetailFromForm = (id: string, values: MatterFormState): MatterDetail => {
  const clientName = clientOptions.find((client) => client.id === values.clientId)?.name ?? 'Unknown client';
  const practiceAreaName = practiceAreaOptions.find((item) => item.id === values.practiceAreaId)?.name ?? null;
  const createdAt = nowIso();
  return {
    id,
    title: values.title.trim(),
    clientName,
    clientId: values.clientId,
    practiceArea: practiceAreaName,
    practiceAreaId: values.practiceAreaId,
    status: values.status,
    updatedAt: createdAt,
    createdAt,
    assigneeIds: values.assigneeIds,
    description: values.description,
    caseNumber: normalizeOptional(values.caseNumber),
    matterType: normalizeOptional(values.matterType),
    urgency: values.urgency || undefined,
    responsibleAttorneyId: normalizeOptional(values.responsibleAttorneyId),
    originatingAttorneyId: normalizeOptional(values.originatingAttorneyId),
    court: normalizeOptional(values.court),
    judge: normalizeOptional(values.judge),
    opposingParty: normalizeOptional(values.opposingParty),
    opposingCounsel: normalizeOptional(values.opposingCounsel),
    openDate: normalizeOptional(values.openDate),
    closeDate: normalizeOptional(values.closeDate),
    billingType: values.billingType,
    attorneyHourlyRate: values.attorneyHourlyRate,
    adminHourlyRate: values.adminHourlyRate,
    paymentFrequency: values.paymentFrequency,
    totalFixedPrice: values.totalFixedPrice,
    settlementAmount: values.settlementAmount,
    milestones: values.milestones?.map((milestone) => ({
      id: ulid(),
      description: milestone.description,
      dueDate: milestone.dueDate,
      amount: milestone.amount ?? asMajor(0),
      status: 'pending'
    })) ?? [],
    contingencyPercent: values.contingencyPercent,
    expenses: [],
    timeEntries: []
  };
};

export default function DebugMatterPage() {
  const [detailsById, setDetailsById] = useState<Record<string, MatterDetail>>(
    () => Object.fromEntries(initialDetails.map((detail) => [detail.id, detail]))
  );
  const [matterOrder, setMatterOrder] = useState<string[]>(() => initialDetails.map((detail) => detail.id));
  const [selectedMatterId, setSelectedMatterId] = useState<string>(initialDetails[0]?.id ?? '');
  const [activeTab, setActiveTab] = useState<DebugTab>('overview');
  const [editorState, setEditorState] = useState<EditorState>('none');
  const [activityItems, setActivityItems] = useState<TimelineItem[]>([
    { id: 'a-1', type: 'created', person: { name: 'Alex Rivera' }, date: '2 days ago' },
    { id: 'a-2', type: 'commented', person: { name: 'Taylor Kim' }, date: '5 hours ago', comment: 'Uploaded revised discovery notes.' }
  ]);
  const [activityDraft, setActivityDraft] = useState('');
  const [isDescriptionEditing, setIsDescriptionEditing] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');

  const matters = useMemo(
    () => matterOrder.map((id) => detailsById[id]).filter((detail): detail is MatterDetail => Boolean(detail)).map(toSummary),
    [detailsById, matterOrder]
  );
  const selectedDetail = selectedMatterId ? detailsById[selectedMatterId] : null;
  const selectedMatter = selectedDetail ? toSummary(selectedDetail) : null;

  const assigneeNameById = useMemo(
    () => new Map(assigneeOptions.map((assignee) => [assignee.id, assignee.name])),
    []
  );

  const headerMeta = useMemo(() => {
    if (!selectedDetail) {
      return {
        clientEntries: [],
        description: '',
        assigneeNames: [],
        billingLabel: 'Not set',
        createdLabel: ''
      };
    }
    const client = clientOptions.find((item) => item.id === selectedDetail.clientId);
    return {
      clientEntries: client ? [{ id: client.id, name: client.name, status: client.status, location: client.location }] : [],
      description: selectedDetail.description,
      assigneeNames: selectedDetail.assigneeIds.map((id) => assigneeNameById.get(id) ?? id),
      billingLabel: selectedDetail.billingType,
      createdLabel: selectedDetail.createdAt
    };
  }, [assigneeNameById, selectedDetail]);

  const selectedTimeEntries = selectedDetail?.timeEntries ?? [];
  const timeStats = useMemo(() => {
    const totalSeconds = selectedTimeEntries.reduce((total, entry) => {
      const duration = (new Date(entry.endTime).getTime() - new Date(entry.startTime).getTime()) / 1000;
      return total + Math.max(0, Math.floor(duration));
    }, 0);
    return {
      totalSeconds,
      totalBillableSeconds: totalSeconds
    };
  }, [selectedTimeEntries]);

  const updateSelectedDetail = (updater: (current: MatterDetail) => MatterDetail) => {
    if (!selectedMatterId) return;
    setDetailsById((prev) => {
      const current = prev[selectedMatterId];
      if (!current) return prev;
      const next = updater(current);
      return { ...prev, [selectedMatterId]: next };
    });
  };

  const handleStatusUpdate = (status: MatterStatus) => {
    updateSelectedDetail((current) => ({
      ...current,
      status,
      updatedAt: nowIso()
    }));
  };

  const handleCreateMatter = async (values: MatterFormState) => {
    const id = ulid();
    const nextDetail = buildDetailFromForm(id, values);
    setDetailsById((prev) => ({ ...prev, [id]: nextDetail }));
    setMatterOrder((prev) => [id, ...prev]);
    setSelectedMatterId(id);
    setEditorState('none');
    setActiveTab('overview');
  };

  const handlePatchMatter = async (patch: Partial<MatterFormState>) => {
    updateSelectedDetail((current) => ({
      ...current,
      caseNumber: patch.caseNumber === undefined ? current.caseNumber : normalizeOptional(patch.caseNumber),
      matterType: patch.matterType === undefined ? current.matterType : normalizeOptional(patch.matterType),
      urgency: patch.urgency === undefined ? current.urgency : (patch.urgency || undefined),
      responsibleAttorneyId: patch.responsibleAttorneyId === undefined ? current.responsibleAttorneyId : normalizeOptional(patch.responsibleAttorneyId),
      originatingAttorneyId: patch.originatingAttorneyId === undefined ? current.originatingAttorneyId : normalizeOptional(patch.originatingAttorneyId),
      court: patch.court === undefined ? current.court : normalizeOptional(patch.court),
      judge: patch.judge === undefined ? current.judge : normalizeOptional(patch.judge),
      opposingParty: patch.opposingParty === undefined ? current.opposingParty : normalizeOptional(patch.opposingParty),
      opposingCounsel: patch.opposingCounsel === undefined ? current.opposingCounsel : normalizeOptional(patch.opposingCounsel),
      openDate: patch.openDate === undefined ? current.openDate : normalizeOptional(patch.openDate),
      closeDate: patch.closeDate === undefined ? current.closeDate : normalizeOptional(patch.closeDate),
      settlementAmount: patch.settlementAmount === undefined ? current.settlementAmount : patch.settlementAmount,
      updatedAt: nowIso()
    }));
  };

  const handleSaveTimeEntry = (values: TimeEntryFormValues, existing?: TimeEntry | null) => {
    updateSelectedDetail((current) => {
      const nextEntry: TimeEntry = existing
        ? { ...existing, ...values }
        : { id: ulid(), ...values };
      const currentEntries = current.timeEntries ?? [];
      const nextEntries = existing
        ? currentEntries.map((entry) => (entry.id === existing.id ? nextEntry : entry))
        : [nextEntry, ...currentEntries];
      return { ...current, timeEntries: nextEntries, updatedAt: nowIso() };
    });
  };

  const handleDeleteTimeEntry = (entry: TimeEntry) => {
    updateSelectedDetail((current) => ({
      ...current,
      timeEntries: (current.timeEntries ?? []).filter((item) => item.id !== entry.id),
      updatedAt: nowIso()
    }));
  };

  const startDescriptionEdit = () => {
    if (!selectedDetail) return;
    setDescriptionDraft(selectedDetail.description ?? '');
    setIsDescriptionEditing(true);
  };

  const cancelDescriptionEdit = () => {
    setDescriptionDraft('');
    setIsDescriptionEditing(false);
  };

  const saveDescription = () => {
    updateSelectedDetail((current) => ({
      ...current,
      description: descriptionDraft,
      updatedAt: nowIso()
    }));
    setDescriptionDraft('');
    setIsDescriptionEditing(false);
  };

  return (
    <main className="mx-auto max-w-[1400px] space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-input-text">Debug Matter Playground</h1>
        <p className="text-sm text-input-placeholder">
          Dev-only page for iterating on matter UI states without backend calls.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="glass-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-line-glass/30 px-4 py-3">
            <h2 className="text-sm font-semibold text-input-text">Matters</h2>
            <Button size="xs" onClick={() => setEditorState('create')}>New</Button>
          </div>
          <ul className="divide-y divide-line-glass/20">
            {matters.map((matter) => (
              <MatterListItem
                key={matter.id}
                matter={matter}
                isSelected={matter.id === selectedMatterId}
                onSelect={() => {
                  setSelectedMatterId(matter.id);
                  setEditorState('none');
                }}
              />
            ))}
          </ul>
        </aside>

        <section className="space-y-4">
          {editorState === 'create' ? (
            <MatterCreateForm
              onClose={() => setEditorState('none')}
              onSubmit={handleCreateMatter}
              clients={clientOptions}
              practiceAreas={practiceAreaOptions}
              assignees={assigneeOptions}
              practiceId="debug-practice"
            />
          ) : null}
          {selectedMatter && selectedDetail ? (
            <>
              <MatterDetailHeader
                matter={selectedMatter}
                detail={selectedDetail}
                headerMeta={headerMeta}
                activeTab={activeTab}
                onTabChange={(next) => setActiveTab(next as DebugTab)}
                tabs={detailTabs}
                onUpdateStatus={handleStatusUpdate}
              />

              {activeTab === 'overview' || activeTab === 'time' || activeTab === 'messages' ? (
                <MatterSummaryCards
                  activeTab={activeTab}
                  timeStats={timeStats}
                  onAddTime={() => setActiveTab('time')}
                  onViewTimesheet={() => setActiveTab('time')}
                />
              ) : null}

              {activeTab === 'overview' ? (
                <div className="space-y-4">
                  <section className="glass-panel overflow-hidden">
                    <div className="border-b border-white/[0.06] px-6 py-4">
                      <h3 className="text-sm font-semibold text-input-text">Matter description</h3>
                    </div>
                    {isDescriptionEditing ? (
                      <div className="space-y-3 px-6 py-5">
                        <MarkdownUploadTextarea
                          value={descriptionDraft}
                          onChange={setDescriptionDraft}
                          practiceId="debug-practice"
                          showTabs
                          showFooter
                          rows={12}
                          defaultTab="preview"
                        />
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" onClick={cancelDescriptionEdit}>
                            Cancel
                          </Button>
                          <Button size="sm" onClick={saveDescription}>
                            Save description
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-4 px-6 py-5">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-input-placeholder">
                          {selectedDetail.description || 'No description yet.'}
                        </p>
                        <Button
                          size="icon-sm"
                          variant="icon"
                          onClick={startDescriptionEdit}
                          icon={<PencilIcon className="h-4 w-4" />}
                          aria-label="Edit description"
                          className="shrink-0"
                        />
                      </div>
                    )}
                  </section>

                  <MatterDetailsPanel
                    detail={selectedDetail}
                    assigneeOptions={assigneeOptions}
                    onSave={handlePatchMatter}
                  />
                </div>
              ) : null}

              {activeTab === 'time' ? (
                <TimeEntriesPanel
                  key={`time-${selectedDetail.id}`}
                  entries={selectedTimeEntries}
                  onSaveEntry={handleSaveTimeEntry}
                  onDeleteEntry={handleDeleteTimeEntry}
                />
              ) : null}

              {activeTab === 'messages' ? (
                <section className="glass-panel p-6 text-sm text-input-placeholder">
                  Message thread preview placeholder for UI layout work.
                </section>
              ) : null}

              {activeTab === 'activity' ? (
                <section className="glass-panel p-6">
                  <ActivityTimeline
                    items={activityItems}
                    showComposer
                    composerDisabled={false}
                    composerValue={activityDraft}
                    composerLabel="Comment"
                    composerPlaceholder="Add internal update..."
                    onComposerChange={setActivityDraft}
                    onComposerSubmit={async (value) => {
                      setActivityItems((prev) => [
                        {
                          id: ulid(),
                          type: 'commented',
                          person: { name: 'Debug User' },
                          date: 'just now',
                          dateTime: nowIso(),
                          comment: value
                        },
                        ...prev
                      ]);
                      setActivityDraft('');
                    }}
                  />
                </section>
              ) : null}
            </>
          ) : null}
        </section>
      </section>
    </main>
  );
}
