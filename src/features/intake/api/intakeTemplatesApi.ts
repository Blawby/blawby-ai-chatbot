import {
  intakeTemplatesPath,
  intakeTemplatePath,
  intakeTemplateSuggestionsPath,
  intakeTemplateSuggestionDecisionPath,
} from '@/config/urls';
import { apiClient } from '@/shared/lib/apiClient';
import type {
  FieldCondition,
  IntakeFieldDefinition,
  IntakeTemplate,
  IntakeTemplateStatus,
} from '@/shared/types/intake';
import type {
  BackendIntakeTemplate,
  BackendIntakeTemplateField,
} from '@/shared/types/wire';

// ---------------------------------------------------------------------------
// Normalizer — backend snake_case → app camelCase at the API edge
// ---------------------------------------------------------------------------

type FieldValidationRules = {
  condition?: FieldCondition;
  completeness_weight?: number;
};

function parseValidationRules(raw: unknown): FieldValidationRules {
  if (typeof raw === 'string') {
    try {
      return parseValidationRules(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as FieldValidationRules;
}

function normalizeField(f: BackendIntakeTemplateField): IntakeFieldDefinition {
  const rules = parseValidationRules(f.validation_rules);
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
    validationHint: f.help_text ?? undefined,
    options: f.options ? f.options.map((o) => o.value) : undefined,
    backendFieldType: f.field_type,
    condition: rules.condition ?? undefined,
    completenessWeight: rules.completeness_weight,
  };
}

function normalizeTemplate(b: BackendIntakeTemplate): IntakeTemplate {
  return {
    id: b.id,
    slug: b.slug,
    name: b.name,
    status: b.status,
    revision: b.revision,
    publishedAt: b.published_at,
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
  /** Stored as validationHint in the app — tells the AI what a valid answer looks like. */
  help_text?: string;
  prompt_hint?: string;
  is_standard?: boolean;
  options?: Array<{ value: string; label: string }>;
  /** JSON pocket for condition (skip logic) and completeness_weight. */
  validation_rules?: Record<string, unknown>;
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

export type UpdateIntakeTemplateInput = Partial<CreateIntakeTemplateInput> & { expected_revision: number };

export type IntakeTemplateProposedEdit =
  | { operation: 'add'; field_key: string; field: IntakeTemplateFieldInput }
  | { operation: 'remove'; field_key: string }
  | { operation: 'reorder'; field_key: string; changes: { order_index: number } }
  | {
      operation: 'rephrase';
      field_key: string;
      changes: { label?: string; placeholder?: string | null; help_text?: string | null; prompt_hint?: string | null };
    }
  | {
      operation: 'condition_change';
      field_key: string;
      changes: { required?: boolean; phase?: 'required' | 'enrichment'; validation_rules?: Record<string, unknown> | null };
    };

export interface IntakeTemplateSuggestion {
  id: string;
  organization_id: string;
  template_id: string;
  request_key: string;
  base_revision: number;
  instruction: string;
  proposed_edits: IntakeTemplateProposedEdit[];
  analytics_evidence: {
    status: 'available' | 'unavailable';
    window: { from: string; to: string } | null;
    numerator: number | null;
    denominator: number | null;
    provenance: string;
    reason: string | null;
  };
  status: 'staged' | 'approved' | 'dismissed';
  created_by: string;
  decided_by: string | null;
  applied_revision: number | null;
  created_at: string;
  decided_at: string | null;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function listIntakeTemplates(practiceId: string): Promise<IntakeTemplate[]> {
  const result = await apiClient.get<{ templates: BackendIntakeTemplate[] }>(intakeTemplatesPath(practiceId));
  if (!Array.isArray(result?.data?.templates)) {
    throw new Error(`Unexpected response from backend: missing data for intake templates (practice ${practiceId})`);
  }
  return result.data.templates.map(normalizeTemplate);
}

export async function getIntakeTemplate(practiceId: string, templateId: string): Promise<IntakeTemplate> {
  const result = await apiClient.get<{ template: BackendIntakeTemplate }>(intakeTemplatePath(practiceId, templateId));
  if (!result?.data?.template) throw new Error('Intake template not found');
  return normalizeTemplate(result.data.template);
}

export async function createIntakeTemplate(
  practiceId: string,
  input: CreateIntakeTemplateInput,
): Promise<IntakeTemplate> {
  const result = await apiClient.post<{ template: BackendIntakeTemplate }>(intakeTemplatesPath(practiceId), input);
  if (!result?.data?.template) throw new Error('Failed to create intake template');
  return normalizeTemplate(result.data.template);
}

export async function updateIntakeTemplate(
  practiceId: string,
  templateId: string,
  input: UpdateIntakeTemplateInput,
): Promise<IntakeTemplate> {
  const result = await apiClient.put<{ template: BackendIntakeTemplate }>(
    intakeTemplatePath(practiceId, templateId),
    input,
  );
  if (!result?.data?.template) throw new Error('Failed to update intake template');
  return normalizeTemplate(result.data.template);
}

export async function deleteIntakeTemplate(practiceId: string, templateId: string): Promise<void> {
  await apiClient.delete(intakeTemplatePath(practiceId, templateId));
}

export async function listIntakeTemplateSuggestions(
  practiceId: string,
  templateId: string,
): Promise<IntakeTemplateSuggestion[]> {
  const result = await apiClient.get<{ suggestions: IntakeTemplateSuggestion[] }>(
    intakeTemplateSuggestionsPath(practiceId, templateId),
  );
  if (!Array.isArray(result?.data?.suggestions)) {
    throw new Error('Unexpected response from backend: missing intake template suggestions');
  }
  return result.data.suggestions;
}

export async function approveIntakeTemplateSuggestion(
  practiceId: string,
  templateId: string,
  suggestionId: string,
  expectedRevision: number,
): Promise<{ suggestion: IntakeTemplateSuggestion; template: IntakeTemplate }> {
  const result = await apiClient.post<{ suggestion: IntakeTemplateSuggestion; template: BackendIntakeTemplate }>(
    intakeTemplateSuggestionDecisionPath(practiceId, templateId, suggestionId, 'approve'),
    { expected_revision: expectedRevision },
  );
  if (!result?.data?.suggestion || !result.data.template) {
    throw new Error('Failed to apply intake template suggestion');
  }
  return { suggestion: result.data.suggestion, template: normalizeTemplate(result.data.template) };
}

export async function dismissIntakeTemplateSuggestion(
  practiceId: string,
  templateId: string,
  suggestionId: string,
): Promise<IntakeTemplateSuggestion> {
  const result = await apiClient.post<{ suggestion: IntakeTemplateSuggestion }>(
    intakeTemplateSuggestionDecisionPath(practiceId, templateId, suggestionId, 'dismiss'),
    {},
  );
  if (!result?.data?.suggestion) throw new Error('Failed to dismiss intake template suggestion');
  return result.data.suggestion;
}
