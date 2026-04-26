import { useMemo, useState, useEffect } from 'preact/hooks';
import axios from 'axios';
import { useMattersData } from '@/shared/hooks/useMattersData';
import { useClientsData } from '@/shared/hooks/useClientsData';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { listClientInvoices, listInvoices } from '@/features/invoices/services/invoicesService';
import type { ComboboxOption } from '@/shared/ui/input';
import type { UserDetailStatus } from '@/shared/lib/apiClient';
import {
  CLIENT_INVOICES_FILTER_MAP,
  CLIENT_MATTERS_FILTER_MAP,
  MATTERS_FILTER_MAP,
  PRACTICE_INVOICES_FILTER_MAP,
} from '@/shared/config/navConfig';

const toBillingTypeLabel = (value?: string | null) => {
  if (!value) return null;
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
};

type UseWorkspaceDataInput = {
  practiceId: string;
  isPracticeWorkspace: boolean;
  isClientWorkspace: boolean;
  view: string;
  layoutMode: 'desktop' | 'mobile' | 'widget';
  workspaceSection: string;
  activeSecondaryFilter: string | undefined;
  selectedMatterIdFromPath: string | null | undefined;
  sessionUserId: string | null;
};

export function useWorkspaceData({
  practiceId,
  isPracticeWorkspace,
  isClientWorkspace,
  view,
  layoutMode,
  workspaceSection,
  activeSecondaryFilter,
  selectedMatterIdFromPath,
  sessionUserId,
}: UseWorkspaceDataInput) {
  const mattersStatusFilter = useMemo<string[]>(() => {
    if (workspaceSection !== 'matters') return [];
    if (!activeSecondaryFilter) return [];
    if (isPracticeWorkspace) {
      return MATTERS_FILTER_MAP[activeSecondaryFilter] ?? [];
    }
    if (isClientWorkspace) {
      return CLIENT_MATTERS_FILTER_MAP[activeSecondaryFilter] ?? [];
    }
    return [];
  }, [activeSecondaryFilter, isClientWorkspace, isPracticeWorkspace, workspaceSection]);

  const contactsStatusFilter = useMemo<UserDetailStatus | null>(() => null, []);

  const invoicesStatusFilter = useMemo<string[]>(() => {
    if (workspaceSection !== 'invoices') return [];
    if (!activeSecondaryFilter) return [];
    if (isPracticeWorkspace) {
      return PRACTICE_INVOICES_FILTER_MAP[activeSecondaryFilter] ?? [];
    }
    if (isClientWorkspace) {
      return CLIENT_INVOICES_FILTER_MAP[activeSecondaryFilter] ?? [];
    }
    return [];
  }, [activeSecondaryFilter, isClientWorkspace, isPracticeWorkspace, workspaceSection]);

  // Always fetch the full unfiltered matters list so the inspector can use it.
  // The mattersStore handles deduplication — this fires once and caches.
  const mattersData = useMattersData(
    practiceId,
    [], // no status filter — fetch all, filter at display time
    { enabled: isPracticeWorkspace || isClientWorkspace }
  );

  // Filtered view for the matters list page (status filter applied after fetch)
  const filteredMattersItems = useMemo(() => {
    if (!mattersStatusFilter || mattersStatusFilter.length === 0) return mattersData.items;
    const accepted = new Set(mattersStatusFilter.map((s) => s.trim().toLowerCase()));
    return mattersData.items.filter((m) => accepted.has(String(m.status ?? '').toLowerCase()));
  }, [mattersData.items, mattersStatusFilter]);

  const mattersDataForView = useMemo(() => ({
    ...mattersData,
    items: filteredMattersItems,
  }), [mattersData, filteredMattersItems]);

  const contactsData = useClientsData(
    practiceId,
    contactsStatusFilter,
    sessionUserId,
    { enabled: isPracticeWorkspace && (view === 'contacts' || view === 'matters') }
  );

  const selectedMatter = useMemo(
    () => mattersData?.items?.find((matter) => matter.id === selectedMatterIdFromPath) ?? null,
    [mattersData?.items, selectedMatterIdFromPath]
  );

  const matterClientOptions = useMemo<ComboboxOption[]>(
    () => (contactsData?.items ?? [])
      .map((client): ComboboxOption | null => {
        const userId = client.user?.id;
        if (!userId) return null;
        return {
          value: userId,
          label: (() => {
            const name = client.user?.name?.trim();
            return name && name.length ? name : client.user?.email ?? 'Unknown contact';
          })(),
          meta: client.user?.email ?? undefined,
        };
      })
      .filter((option): option is ComboboxOption => option !== null),
    [contactsData?.items]
  );

  const matterClientPeople = useMemo(
    () => (contactsData?.items ?? [])
      .map((client) => {
        const userId = client.user?.id;
        if (!userId) return null;
        return {
          userId,
          name: (() => {
            const name = client.user?.name?.trim();
            return name && name.length ? name : client.user?.email ?? 'Unknown contact';
          })(),
          email: client.user?.email ?? undefined,
          image: null,
          role: 'client',
        };
      })
      .filter((client) => client !== null),
    [contactsData?.items]
  );

  const selectedMatterInspectorData = useMemo(() => {
    if (!selectedMatter) return null;

    const clientNameById = new Map(
      (contactsData?.items ?? []).map((client) => [
        client.user?.id ?? '',
        client.user?.name ?? client.user?.email ?? '',
      ])
    );
    const clientNameFromId = selectedMatter.client_id ? clientNameById.get(selectedMatter.client_id) : null;
    const selectedMatterRecord = selectedMatter as Record<string, unknown>;
    const selectedMatterClientName = clientNameFromId
      ?? (typeof selectedMatterRecord.client_name === 'string' ? selectedMatterRecord.client_name : null);

    const assigneeNamesFromRows = Array.isArray(selectedMatter.assignees)
      ? selectedMatter.assignees
        .map((assignee) => {
          if (typeof assignee === 'string') {
            return assignee.trim();
          }
          if (!assignee || typeof assignee !== 'object') return '';
          const row = assignee as Record<string, unknown>;
          const name = typeof row.name === 'string'
            ? row.name
            : (typeof row.email === 'string' ? row.email : '');
          return name.trim();
        })
        .filter((name): name is string => name.length > 0)
      : [];
    const selectedMatterAssigneeNames = assigneeNamesFromRows.length > 0
      ? assigneeNamesFromRows
      : (selectedMatter.assignee_ids?.map((id) => `User ${id.slice(0, 6)}`) ?? []);

    return {
      matterClientName: selectedMatterClientName,
      matterAssigneeNames: selectedMatterAssigneeNames,
      matterBillingLabel: toBillingTypeLabel(selectedMatter.billing_type),
      matterCreatedLabel: formatLongDate(selectedMatter.created_at),
      matterUpdatedLabel: selectedMatter.updated_at
        ? `Updated ${formatRelativeTime(selectedMatter.updated_at)}`
        : null,
      matterClientId: selectedMatter.client_id ?? null,
      matterUrgency: typeof selectedMatter.urgency === 'string' ? selectedMatter.urgency : null,
      matterResponsibleAttorneyId: selectedMatter.responsible_attorney_id ?? null,
      matterOriginatingAttorneyId: selectedMatter.originating_attorney_id ?? null,
      matterCaseNumber: selectedMatter.case_number ?? null,
      matterType: selectedMatter.matter_type ?? null,
      matterCourt: selectedMatter.court ?? null,
      matterJudge: selectedMatter.judge ?? null,
      matterOpposingParty: selectedMatter.opposing_party ?? null,
      matterOpposingCounsel: selectedMatter.opposing_counsel ?? null,
    };
  }, [contactsData?.items, selectedMatter]);

  const [hasDesktopInvoiceListItems, setHasDesktopInvoiceListItems] = useState<boolean | null>(null);

  useEffect(() => {
    if (layoutMode !== 'desktop' || view !== 'invoices') {
      setHasDesktopInvoiceListItems(null);
      return;
    }
    if (!practiceId || (!isPracticeWorkspace && !isClientWorkspace)) {
      setHasDesktopInvoiceListItems(null);
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        const result = isPracticeWorkspace
          ? await listInvoices(
              practiceId,
              { rules: [], page: 1, pageSize: 1 },
              { signal: controller.signal, statusFilter: invoicesStatusFilter }
            )
          : await listClientInvoices(
              practiceId,
              { rules: [], page: 1, pageSize: 1 },
              { signal: controller.signal, statusFilter: invoicesStatusFilter }
            );

        if (!controller.signal.aborted) {
          setHasDesktopInvoiceListItems(result.total > 0);
        }
      } catch (error) {
        if ((error as DOMException)?.name === 'AbortError' || axios.isCancel(error)) {
          return;
        }
        if (!controller.signal.aborted) {
          setHasDesktopInvoiceListItems(true);
        }
      }
    })();

    return () => controller.abort();
  }, [invoicesStatusFilter, isClientWorkspace, isPracticeWorkspace, layoutMode, practiceId, view]);

  return {
    mattersStatusFilter,
    contactsStatusFilter,
    invoicesStatusFilter,
    mattersData,
    filteredMattersItems,
    mattersDataForView,
    contactsData,
    selectedMatter,
    matterClientOptions,
    matterClientPeople,
    selectedMatterInspectorData,
    hasDesktopInvoiceListItems,
  };
}
