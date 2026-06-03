import { intakeTemplatesPath, intakeTemplatePath } from '@/config/urls';
import { apiClient } from '@/shared/lib/apiClient';
import type {
  BackendIntakeTemplate,
  BackendIntakeTemplateField,
  IntakeFieldDefinition,
  IntakeTemplate,
  IntakeTemplateStatus,
} from '@/shared/types/intake';

// ---------------------------------------------------------------------------
// Normalizer — backend snake_case → app camelCase at the API edge
// ---------------------------------------------------------------------------

function normalizeField(f: BackendIntakeTemplateField): IntakeFieldDefinition {
  return {
    key: f.key,
    label: f.label,
    // backend uses 'textarea'|'email'|'phone'|'multiselect'; map to nearest app type
    type: (f.field_type === 'textarea' || f.field_type === 'email' || f.field_type === 'phone'
      ? 'text'
      : f.field_type === 'multiselect'
        ? 'select'
        : f.field_type) as IntakeFieldDefinition['type'],
    required: f.required,
    phase: f.phase,
    isStandard: f.is_standard,
    promptHint: f.prompt_hint ?? undefined,
    options: f.options ? f.options.map((o) => o.value) : undefined,
  };
}

function normalizeTemplate(b: BackendIntakeTemplate): IntakeTemplate {
  return {
    id: b.id,
    slug: b.slug,
    name: b.name,
    status: b.status,
    is_default: b.is_default,
    isDefault: b.is_default,
    introMessage: b.intro_message ?? undefined,
    legalDisclaimer: b.legal_disclaimer ?? undefined,
    paymentLinkEnabled: b.payment_link_enabled,
    consultationFee: b.consultation_fee ?? undefined,
    fields: (b.fields ?? []).slice().sort((a, b) => a.order_index - b.order_index).map(normalizeField),
  };
}

// ---------------------------------------------------------------------------
// Request body types for create / update
// ---------------------------------------------------------------------------

export interface IntakeTemplateFieldInput {
  key: string;
  label: string;
  field_type: BackendIntakeTemplateField['field_type'];
  phase: 'required' | 'enrichment';
  required?: boolean;
  order_index?: number;
  placeholder?: string;
  help_text?: string;
  prompt_hint?: string;
  is_standard?: boolean;
  options?: Array<{ value: string; label: string }>;
}

export interface CreateIntakeTemplateInput {
  slug: string;
  name: string;
  description?: string;
  status?: IntakeTemplateStatus;
  is_default?: boolean;
  intro_message?: string;
  legal_disclaimer?: string;
  payment_link_enabled?: boolean;
  consultation_fee?: number;
  fields?: IntakeTemplateFieldInput[];
}

export type UpdateIntakeTemplateInput = Partial<CreateIntakeTemplateInput>;

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function listIntakeTemplates(practiceId: string): Promise<IntakeTemplate[]> {
  const result = await apiClient.get<{ data: BackendIntakeTemplate[] }>(intakeTemplatesPath(practiceId));
  const list = Array.isArray(result?.data) ? result.data : [];
  return list.map(normalizeTemplate);
}

export async function getIntakeTemplate(practiceId: string, templateId: string): Promise<IntakeTemplate> {
  const result = await apiClient.get<{ data: BackendIntakeTemplate }>(intakeTemplatePath(practiceId, templateId));
  if (!result?.data) throw new Error('Intake template not found');
  return normalizeTemplate(result.data);
}

export async function createIntakeTemplate(
  practiceId: string,
  input: CreateIntakeTemplateInput,
): Promise<IntakeTemplate> {
  const result = await apiClient.post<{ data: BackendIntakeTemplate }>(intakeTemplatesPath(practiceId), input);
  if (!result?.data) throw new Error('Failed to create intake template');
  return normalizeTemplate(result.data);
}

export async function updateIntakeTemplate(
  practiceId: string,
  templateId: string,
  input: UpdateIntakeTemplateInput,
): Promise<IntakeTemplate> {
  const result = await apiClient.put<{ data: BackendIntakeTemplate }>(
    intakeTemplatePath(practiceId, templateId),
    input,
  );
  if (!result?.data) throw new Error('Failed to update intake template');
  return normalizeTemplate(result.data);
}

export async function deleteIntakeTemplate(practiceId: string, templateId: string): Promise<void> {
  await apiClient.delete(intakeTemplatePath(practiceId, templateId));
}
