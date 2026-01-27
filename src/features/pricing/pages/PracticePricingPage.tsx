import { useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import {
  CreditCardIcon,
  EllipsisHorizontalIcon,
  LockClosedIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useNavigation } from '@/shared/utils/navigation';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { Button } from '@/shared/ui/Button';
import { CurrencyInput, Switch } from '@/shared/ui/input';
import { StatusBadge } from '@/shared/ui/badges/StatusBadge';
import { PageHeader } from '@/shared/ui/layout';
import { Breadcrumbs } from '@/shared/ui/navigation';
import { DataTable, type DataTableRow } from '@/shared/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/ui/dropdown';
import Modal from '@/shared/components/Modal';
import Message from '@/features/chat/components/Message';
import type { IntakePaymentRequest } from '@/shared/utils/intakePayments';

const DEFAULT_PREVIEW_FEE = 150;

type PricingModelTab = 'intake-fees' | 'hourly-rates' | 'contingency-fees' | 'project-fees';

const formatDate = (value?: string | null, locale = 'en') => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
};

export const PracticePricingPage = () => {
  const { activeMemberRole, activeMemberRoleLoading } = useSessionContext();
  const { currentPractice, loading, updatePracticeDetails } = usePracticeManagement({ fetchPracticeDetails: true });
  const { showSuccess, showError } = useToastContext();
  const { navigate } = useNavigation();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'archived'>('all');
  const [modelTab, setModelTab] = useState<PricingModelTab>('intake-fees');
  const [isFeeModalOpen, setIsFeeModalOpen] = useState(false);
  const [feeEnabledDraft, setFeeEnabledDraft] = useState(false);
  const [feeDraft, setFeeDraft] = useState<number | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const checkoutPreviewRef = useRef<HTMLDivElement | null>(null);

  const locale = typeof navigator !== 'undefined' ? navigator.language : 'en';
  const canEdit = activeMemberRole === 'owner' || activeMemberRole === 'admin';
  const isReadOnly = !activeMemberRoleLoading && !canEdit;

  const pathSegments = location.path.split('/').filter(Boolean);
  const detailSlug = pathSegments[0] === 'practice' && pathSegments[1] === 'pricing'
    ? pathSegments[2]
    : undefined;
  const isConsultationDetail = detailSlug === 'consultation-fee';

  const activeFee = useMemo(() => {
    const raw = currentPractice?.consultationFee;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  }, [currentPractice?.consultationFee]);

  const feeEnabled = typeof activeFee === 'number' && activeFee > 0;
  const formattedFee = useMemo(() => {
    if (!feeEnabled || typeof activeFee !== 'number') return null;
    return formatCurrency(activeFee, 'USD', locale);
  }, [activeFee, feeEnabled, locale]);

  const previewAmount = feeEnabled && typeof activeFee === 'number' ? activeFee : DEFAULT_PREVIEW_FEE;
  const formattedPreviewFee = useMemo(
    () => formatCurrency(previewAmount, 'USD', locale),
    [previewAmount, locale]
  );

  const stripeStatus = currentPractice?.businessOnboardingStatus;
  const stripeReady = stripeStatus === 'completed' || stripeStatus === 'not_required';
  const practiceName = currentPractice?.name || 'your practice';
  const previewPaymentRequest = useMemo<IntakePaymentRequest>(() => ({
    amount: Math.round(previewAmount * 100),
    currency: 'USD',
    clientSecret: 'preview',
    practiceName
  }), [practiceName, previewAmount]);

  const feeValidationError = showValidation && feeEnabledDraft && (!Number.isFinite(feeDraft) || (feeDraft ?? 0) <= 0)
    ? 'Enter a fee greater than $0.'
    : undefined;

  const openFeeModal = () => {
    const nextFee = typeof activeFee === 'number' && activeFee > 0 ? activeFee : undefined;
    setFeeDraft(nextFee);
    setFeeEnabledDraft(Boolean(nextFee));
    setShowValidation(false);
    setIsFeeModalOpen(true);
  };

  const closeFeeModal = () => {
    setIsFeeModalOpen(false);
  };

  const handlePreviewPayment = () => {
    checkoutPreviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSaveFee = async () => {
    if (!currentPractice) {
      showError('Consultation fee', 'Missing practice information.');
      return;
    }
    if (!canEdit) {
      showError('Consultation fee', 'Only owners and admins can update pricing.');
      return;
    }
    if (feeEnabledDraft && (!Number.isFinite(feeDraft) || (feeDraft ?? 0) <= 0)) {
      setShowValidation(true);
      showError('Consultation fee', 'Enter a fee greater than $0.');
      return;
    }

    const nextFee = feeEnabledDraft ? (feeDraft ?? null) : null;
    const currentFee = typeof activeFee === 'number' ? activeFee : null;
    if (nextFee === currentFee || (!feeEnabledDraft && !feeEnabled)) {
      setIsFeeModalOpen(false);
      return;
    }

    setIsSaving(true);
    try {
      await updatePracticeDetails(currentPractice.id, { consultationFee: nextFee });
      showSuccess(
        feeEnabledDraft ? 'Consultation fee enabled' : 'Consultation fee disabled',
        feeEnabledDraft ? 'New intakes will require payment.' : 'New intakes will no longer require payment.'
      );
      setIsFeeModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update consultation fee.';
      showError('Consultation fee', message);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading && !currentPractice) {
    return (
      <div className="h-full overflow-y-auto p-6 pb-32">
        <div className="max-w-6xl mx-auto space-y-4">
          <PageHeader title="Pricing" />
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-card-bg p-4 text-sm text-gray-600 dark:text-gray-400">
            Loading pricing settings...
          </div>
        </div>
      </div>
    );
  }

  if (!currentPractice && !loading) {
    return (
      <div className="h-full overflow-y-auto p-6 pb-32">
        <div className="max-w-6xl mx-auto space-y-4">
          <PageHeader title="Pricing" />
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-card-bg p-4 text-sm text-gray-600 dark:text-gray-400">
            Select or create a practice to configure pricing.
          </div>
        </div>
      </div>
    );
  }


  const updatedAt = formatDate(currentPractice?.updatedAt, locale);
  const createdAt = formatDate(currentPractice?.createdAt, locale);
  const consultationRow: DataTableRow = {
    id: 'consultation-fee',
    onClick: () => navigate('/practice/pricing/consultation-fee'),
    cells: {
      name: (
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 flex items-center justify-center">
            <CreditCardIcon className="h-4 w-4 text-gray-500 dark:text-gray-300" aria-hidden="true" />
          </span>
          <div>
            <div className="text-sm font-semibold text-gray-900 dark:text-white">Consultation fee</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Intake payments</div>
          </div>
        </div>
      ),
      pricing: formattedFee ? (
        <div>
          <div className="text-sm font-semibold text-gray-900 dark:text-white">{formattedFee}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Per intake · USD</div>
        </div>
      ) : (
        <span className="text-sm text-gray-500 dark:text-gray-400">Not set</span>
      ),
      updated: updatedAt,
      created: createdAt,
      action: (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-200 dark:hover:bg-white/5"
              aria-label="Open consultation fee actions"
              icon={
                <EllipsisHorizontalIcon className="h-5 w-5" />
              }
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[9rem]">
            <DropdownMenuItem onSelect={() => navigate('/practice/pricing/consultation-fee')}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => showError('Archive', 'Archiving fees is not available yet.')}
            >
              Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  };

  const modelRows = modelTab === 'intake-fees' ? [consultationRow] : [];
  const totalCount = modelRows.length;
  const activeCount = modelTab === 'intake-fees' && feeEnabled ? 1 : 0;
  const archivedCount = Math.max(0, totalCount - activeCount);

  const filteredRows = (() => {
    if (activeTab === 'active') {
      return modelTab === 'intake-fees' && feeEnabled ? modelRows : [];
    }
    if (activeTab === 'archived') {
      return modelTab === 'intake-fees' && !feeEnabled ? modelRows : [];
    }
    return modelRows;
  })();

  const createOptions: Array<{ id: PricingModelTab; label: string; description: string; onSelect: () => void }> = [
    {
      id: 'intake-fees',
      label: 'Intake fee',
      description: 'Charge clients before intake confirmation.',
      onSelect: () => navigate('/practice/pricing/consultation-fee')
    },
    {
      id: 'hourly-rates',
      label: 'Hourly rates',
      description: 'Set default rates by role.',
      onSelect: () => showError('Hourly rates', 'Hourly rate setup is not available yet.')
    },
    {
      id: 'contingency-fees',
      label: 'Contingency fees',
      description: 'Define contingency percentages.',
      onSelect: () => showError('Contingency fees', 'Contingency fee setup is not available yet.')
    },
    {
      id: 'project-fees',
      label: 'Project fees',
      description: 'Create fixed-fee templates.',
      onSelect: () => showError('Project fees', 'Project fee setup is not available yet.')
    }
  ];

  const emptyStateCopy: Record<PricingModelTab, { title: string; description: string; action: string }> = {
    'intake-fees': {
      title: 'Create an intake fee',
      description: 'Charge clients before you confirm an intake.',
      action: 'Create intake fee'
    },
    'hourly-rates': {
      title: 'Set hourly rates',
      description: 'Define default hourly rates by role.',
      action: 'Create hourly rates'
    },
    'contingency-fees': {
      title: 'Create a contingency fee',
      description: 'Set percentage-based fees for contingency matters.',
      action: 'Create contingency fee'
    },
    'project-fees': {
      title: 'Create a project fee',
      description: 'Build fixed-fee templates for common matters.',
      action: 'Create project fee'
    }
  };

  const modelEmptyState = emptyStateCopy[modelTab];

  if (!isConsultationDetail) {
    return (
      <div className="h-full overflow-y-auto p-6 pb-32">
        <div className="max-w-6xl mx-auto space-y-6">
          <PageHeader
            title="Pricing catalog"
            subtitle="Manage practice fees, rates, and pricing schedules."
            actions={(
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!canEdit}
                    icon={<PlusIcon className="h-4 w-4" />}
                  >
                    Create
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[14rem]">
                  {createOptions.map((option) => (
                    <DropdownMenuItem key={option.id} onSelect={option.onSelect}>
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{option.label}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{option.description}</div>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          />

          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex flex-wrap gap-6 text-sm font-medium">
              {[
                { id: 'intake-fees', label: 'Intake fees' },
                { id: 'hourly-rates', label: 'Hourly rates' },
                { id: 'contingency-fees', label: 'Contingency fees' },
                { id: 'project-fees', label: 'Project fees' }
              ].map((tab) => {
                const isActive = modelTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setModelTab(tab.id as typeof modelTab)}
                    className={isActive
                      ? 'pb-3 text-accent-600 dark:text-accent-400 border-b-2 border-accent-500'
                      : 'pb-3 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 border-b-2 border-transparent'}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { id: 'all', label: 'All', count: totalCount },
              { id: 'active', label: 'Active', count: activeCount },
              { id: 'archived', label: 'Archived', count: archivedCount }
            ].map((card) => {
              const isActive = activeTab === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setActiveTab(card.id as 'all' | 'active' | 'archived')}
                  className={isActive
                    ? 'rounded-xl border border-accent-500 bg-accent-50/40 dark:bg-accent-500/10 p-4 text-left'
                    : 'rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-card-bg p-4 text-left hover:border-gray-300 dark:hover:border-gray-600'}
                >
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">{card.label}</div>
                  <div className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{card.count}</div>
                </button>
              );
            })}
          </div>

          <div className="-mx-4 sm:-mx-0 pb-24 min-h-[520px]">
            {filteredRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-16">
                <div className="h-12 w-12 rounded-xl bg-gray-100 dark:bg-dark-card-bg border border-gray-200 dark:border-white/10 flex items-center justify-center text-gray-500 dark:text-gray-400">
                  <PlusIcon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-gray-900 dark:text-white">
                  {modelEmptyState.title}
                </h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 max-w-md">
                  {modelEmptyState.description}
                </p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="primary"
                      size="sm"
                      className="mt-4"
                      disabled={!canEdit}
                      icon={<PlusIcon className="h-4 w-4" />}
                    >
                      {modelEmptyState.action}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[14rem]">
                    {createOptions.map((option) => (
                      <DropdownMenuItem key={option.id} onSelect={option.onSelect}>
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{option.label}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{option.description}</div>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <DataTable
                columns={[
                  { id: 'name', label: 'Name', isPrimary: true },
                  { id: 'pricing', label: 'Pricing', hideAt: 'sm', mobileClassName: 'text-gray-500 dark:text-gray-400' },
                  { id: 'created', label: 'Created', hideAt: 'sm', mobileClassName: 'text-gray-500 dark:text-gray-400' },
                  { id: 'updated', label: 'Updated', hideAt: 'sm', mobileClassName: 'text-gray-500 dark:text-gray-400' },
                  {
                    id: 'action',
                    label: <span className="sr-only">Actions</span>,
                    align: 'right',
                    isAction: true,
                    headerClassName: 'py-3.5 pr-4 pl-3 sm:pr-0',
                    cellClassName: 'relative py-4 pr-4 pl-3 text-right text-sm font-medium sm:pr-0'
                  }
                ]}
                rows={filteredRows}
                emptyState="No pricing products in this view."
                minRows={6}
              />
            )}
            <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              {filteredRows.length} item{filteredRows.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 pb-32">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="space-y-4">
          <Breadcrumbs
            items={[
              { label: 'Pricing catalog', href: '/practice/pricing' },
              { label: 'Intake fees' }
            ]}
            onNavigate={navigate}
          />
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="h-12 w-12 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 flex items-center justify-center">
                <CreditCardIcon className="h-5 w-5 text-gray-500 dark:text-gray-300" aria-hidden="true" />
              </span>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Consultation fee</h1>
                  <StatusBadge status={feeEnabled ? 'active' : 'inactive'}>
                    {feeEnabled ? 'Active' : 'Not enabled'}
                  </StatusBadge>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {formattedFee ? `${formattedFee} · Per intake · USD` : 'No fee set'}
                </div>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => showError('Archive', 'Archiving fees is not available yet.')}
            >
              Archive
            </Button>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Charge a fee before confirming new intakes.</p>
          {isReadOnly && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Owner/admin access required to update pricing.
            </div>
          )}
        </div>

        {!stripeReady && currentPractice && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-4">
            <div className="flex items-start gap-3">
              <LockClosedIcon className="h-5 w-5 text-amber-700 dark:text-amber-300 mt-0.5" aria-hidden="true" />
              <div className="space-y-2">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Connect Stripe to collect fees</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => navigate('/practice/payouts')}
                    disabled={!canEdit}
                  >
                    Connect Stripe
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate('/practice/payouts')}
                  >
                    View payout settings
                  </Button>
                  {isReadOnly && (
                    <span className="text-xs text-amber-800 dark:text-amber-200 self-center">Owner/admin access required.</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Pricing</h2>
              </div>
              <div className="-mx-4 sm:-mx-0">
                <DataTable
                  columns={[
                    { id: 'price', label: 'Price', isPrimary: true },
                    { id: 'description', label: 'Description', hideAt: 'sm', mobileClassName: 'text-gray-500 dark:text-gray-400' },
                    { id: 'created', label: 'Created', hideAt: 'sm', mobileClassName: 'text-gray-500 dark:text-gray-400' },
                    {
                      id: 'action',
                      label: <span className="sr-only">Edit</span>,
                      align: 'right',
                      isAction: true,
                      headerClassName: 'py-3.5 pr-4 pl-3 sm:pr-0',
                      cellClassName: 'py-4 pr-4 pl-3 text-right text-sm font-medium sm:pr-0'
                    }
                  ]}
                  rows={[
                    {
                      id: 'consultation-fee-price',
                      cells: {
                        price: formattedFee ? (
                          <div>
                            <div className="text-sm font-semibold text-gray-900 dark:text-white">{formattedFee}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Per intake</div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500 dark:text-gray-400">Not set</span>
                        ),
                        description: 'Consultation intake payment',
                        created: createdAt,
                        action: (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={openFeeModal}
                            className="px-0"
                          >
                            Edit<span className="sr-only">, Consultation fee</span>
                          </Button>
                        )
                      }
                    }
                  ]}
                />
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">Preview</h3>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Chat</div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-bg/60 p-4 space-y-3">
                  <Message
                    content="Hi! I need help with a contract review."
                    isUser
                    avatar={{ name: 'Client' }}
                    className="px-0 py-1 hover:bg-transparent"
                  />
                  <Message
                    content="Thanks for reaching out. Please submit your intake to get started."
                    isUser={false}
                    avatar={{ name: 'Blawby', src: '/blawby-favicon-iframe.png' }}
                    className="px-0 py-1 hover:bg-transparent"
                  />
                  <Message
                    content="One more step: submit the consultation fee to complete your intake."
                    isUser={false}
                    avatar={{ name: 'Blawby', src: '/blawby-favicon-iframe.png' }}
                    paymentRequest={previewPaymentRequest}
                    onOpenPayment={handlePreviewPayment}
                    className="px-0 py-1 hover:bg-transparent"
                  />
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Checkout</div>
                <div
                  ref={checkoutPreviewRef}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-bg/60 p-4"
                >
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Complete your intake</h4>
                  </div>
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-bg p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">Consultation fee</div>
                      <div className="text-base font-semibold text-gray-900 dark:text-white">
                        {formattedPreviewFee}
                      </div>
                    </div>
                    <div className="mt-4 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-dark-bg px-4 py-5 text-center text-xs text-gray-500 dark:text-gray-400">
                      Stripe payment form renders here.
                    </div>
                  </div>
                </div>
              </div>

              {!feeEnabled && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Preview uses a sample amount until you enable a fee.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-card-bg p-5 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Details</h3>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Currency</span>
                  <span className="text-gray-900 dark:text-white">USD</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Stripe status</span>
                  <span className="text-gray-900 dark:text-white">{stripeReady ? 'Connected' : 'Action required'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Last updated</span>
                  <span className="text-gray-900 dark:text-white">{updatedAt}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal isOpen={isFeeModalOpen} onClose={closeFeeModal} title="Consultation fee">
        <div className="space-y-4">
          <Switch
            id="consultation-fee-toggle"
            label="Collect consultation fee"
            description="Require payment before confirming an intake."
            value={feeEnabledDraft}
            onChange={(value) => {
              setFeeEnabledDraft(value);
              if (!value) {
                setShowValidation(false);
              }
            }}
            disabled={!canEdit || isSaving}
          />

          {feeEnabledDraft && (
            <CurrencyInput
              label="Fee amount"
              value={feeDraft}
              onChange={setFeeDraft}
              placeholder="150.00"
              disabled={!canEdit || isSaving}
              step={0.01}
              min={0}
              description="USD"
              error={feeValidationError}
            />
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={closeFeeModal} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveFee}
              disabled={!canEdit || isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
