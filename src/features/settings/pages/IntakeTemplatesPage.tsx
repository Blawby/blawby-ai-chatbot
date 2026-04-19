import { useCallback, useMemo, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/input';
import { SectionDivider, SettingsPage } from '@/shared/ui/layout';
import { SettingRow } from '@/features/settings/components/SettingRow';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsHelperText } from '@/features/settings/components/SettingsHelperText';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { STANDARD_FIELD_DEFINITIONS, DEFAULT_INTAKE_TEMPLATE } from '@/shared/constants/intakeTemplates';
import type { IntakeTemplate } from '@/shared/types/intake';

type IntakeTemplatesPageProps = {
  onBack?: () => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SLUG_RE = /^[a-z0-9-]+$/;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getEmbedSnippet(practiceSlug: string, templateSlug: string): string {
  return `<script src="https://app.blawby.com/widget.js" data-practice="${practiceSlug}" data-template="${templateSlug}" async></script>`;
}

function parseTemplatesFromSettings(settings: unknown): IntakeTemplate[] {
  try {
    if (!settings) return [];
    const s = typeof settings === 'string' ? (JSON.parse(settings) as unknown) : settings;
    if (s && typeof s === 'object' && !Array.isArray(s)) {
      const raw = (s as Record<string, unknown>).intakeTemplates;
      if (Array.isArray(raw)) return raw as IntakeTemplate[];
    }
  } catch {
    // Ignore malformed JSON
  }
  return [];
}

// ---------------------------------------------------------------------------
// New Template form state
// ---------------------------------------------------------------------------

type NewTemplateDraft = {
  name: string;
  slug: string;
  slugManuallyEdited: boolean;
  selectedKeys: Set<string>;
};

const emptyDraft = (): NewTemplateDraft => ({
  name: '',
  slug: '',
  slugManuallyEdited: false,
  selectedKeys: new Set(
    STANDARD_FIELD_DEFINITIONS.filter((f) => f.required).map((f) => f.key),
  ),
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function IntakeTemplatesPage({ onBack }: IntakeTemplatesPageProps) {
  const { currentPractice } = usePracticeManagement({ fetchPracticeDetails: true });
  const { details: practiceDetails, updateDetails } = usePracticeDetails(currentPractice?.id, currentPractice?.slug, false);
  const { showSuccess, showError } = useToastContext();

  const [isSaving, setIsSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [draft, setDraft] = useState<NewTemplateDraft>(emptyDraft());
  const [slugError, setSlugError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IntakeTemplate | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Existing custom templates stored in practice settings
  const existingTemplates = useMemo(() => {
    return parseTemplatesFromSettings(practiceDetails?.settings);
  }, [practiceDetails?.settings]);

  // ---------------------------------------------------------------------------
  // Persist helpers
  // ---------------------------------------------------------------------------

  const persistTemplates = useCallback(async (next: IntakeTemplate[]) => {
    if (!currentPractice) return;
    const currentSettings = practiceDetails?.settings;
    let settingsObj: Record<string, unknown> = {};
    try {
      if (typeof currentSettings === 'string') {
        settingsObj = JSON.parse(currentSettings) as Record<string, unknown>;
      } else if (currentSettings && typeof currentSettings === 'object' && !Array.isArray(currentSettings)) {
        settingsObj = { ...(currentSettings as Record<string, unknown>) };
      }
    } catch {
      settingsObj = {};
    }

    const payload = { ...settingsObj, intakeTemplates: next };
    await updateDetails({ settings: JSON.stringify(payload) });
  }, [currentPractice, practiceDetails?.settings, updateDetails]);

  // ---------------------------------------------------------------------------
  // New template form
  // ---------------------------------------------------------------------------

  const openForm = () => {
    setDraft(emptyDraft());
    setSlugError(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
  };

  const handleNameChange = (name: string) => {
    setDraft((prev) => ({
      ...prev,
      name,
      slug: prev.slugManuallyEdited ? prev.slug : slugify(name),
    }));
    setSlugError(null);
  };

  const handleSlugChange = (slug: string) => {
    setDraft((prev) => ({ ...prev, slug, slugManuallyEdited: true }));
    validateSlug(slug);
  };

  const validateSlug = (slug: string): boolean => {
    if (!slug.trim()) {
      setSlugError('Slug is required.');
      return false;
    }
    if (!SLUG_RE.test(slug)) {
      setSlugError('Slug must be lowercase letters, numbers, and hyphens only.');
      return false;
    }
    if (slug === 'default') {
      setSlugError('"default" is reserved.');
      return false;
    }
    if (existingTemplates.some((t) => t.slug === slug)) {
      setSlugError('A template with this slug already exists.');
      return false;
    }
    setSlugError(null);
    return true;
  };

  const toggleField = (key: string) => {
    // Required fields (description, city, state) cannot be unchecked
    const field = STANDARD_FIELD_DEFINITIONS.find((f) => f.key === key);
    if (field?.required) return;

    setDraft((prev) => {
      const next = new Set(prev.selectedKeys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return { ...prev, selectedKeys: next };
    });
  };

  const handleSaveTemplate = async () => {
    if (!validateSlug(draft.slug)) return;
    if (!draft.name.trim()) {
      showError('Template name is required.');
      return;
    }

    const selectedFields = STANDARD_FIELD_DEFINITIONS.filter((f) =>
      draft.selectedKeys.has(f.key),
    );

    const newTemplate: IntakeTemplate = {
      slug: draft.slug.trim(),
      name: draft.name.trim(),
      isDefault: false,
      fields: selectedFields,
    };

    setIsSaving(true);
    try {
      await persistTemplates([...existingTemplates, newTemplate]);
      showSuccess('Template created', `"${newTemplate.name}" template saved.`);
      setIsFormOpen(false);
    } catch (error) {
      showError('Save failed', error instanceof Error ? error.message : 'Unable to save template.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTemplate = async (template: IntakeTemplate) => {
    setIsSaving(true);
    try {
      await persistTemplates(existingTemplates.filter((t) => t.slug !== template.slug));
      showSuccess('Template deleted', `"${template.name}" has been removed.`);
      setDeleteTarget(null);
    } catch (error) {
      showError('Delete failed', error instanceof Error ? error.message : 'Unable to delete template.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyEmbed = (templateSlug: string) => {
    const practiceSlug = currentPractice?.slug ?? '';
    if (!practiceSlug) return;
    const snippet = getEmbedSnippet(practiceSlug, templateSlug);
    navigator.clipboard.writeText(snippet).then(() => {
      setCopiedSlug(templateSlug);
      setTimeout(() => setCopiedSlug(null), 2000);
    }).catch(() => {
      showError('Copy failed', 'Could not copy to clipboard.');
    });
  };

  if (!currentPractice) {
    return (
      <SettingsPage title="Intake Templates" showBack={Boolean(onBack)} onBack={onBack}>
        <p className="text-sm text-input-placeholder">No practice selected.</p>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage
      title="Intake Templates"
      subtitle="Customise which fields the AI collects for each intake type"
      showBack={Boolean(onBack)}
      backVariant="close"
      onBack={onBack}
      actions={
        <Button type="button" size="sm" onClick={openForm} disabled={isSaving}>
          + New Template
        </Button>
      }
    >
      <div className="space-y-6">
        {/* ── Default template (read-only) ── */}
        <SettingSection title="Default template">
          <SettingRow
            label="Default"
            description="Used when no ?template= parameter is present. Cannot be edited."
            layout="responsive"
          >
            <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent ring-1 ring-inset ring-accent/20">
              System default
            </span>
          </SettingRow>
          <SectionDivider />
          <div className="pb-2 pt-1">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-input-placeholder">Fields collected</p>
            <ul className="flex flex-wrap gap-2">
              {DEFAULT_INTAKE_TEMPLATE.fields.map((f) => (
                <li
                  key={f.key}
                  className="rounded-full border border-line-glass/30 bg-surface-card px-3 py-1 text-xs text-input-text"
                >
                  {f.label}{f.required ? ' *' : ''}
                </li>
              ))}
            </ul>
          </div>
        </SettingSection>

        {/* ── Custom templates ── */}
        {existingTemplates.length > 0 && (
          <SettingSection title="Custom templates">
            {existingTemplates.map((template, idx) => (
              <div key={template.slug}>
                {idx > 0 && <SectionDivider />}
                <div className="py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-input-text">{template.name}</p>
                      <SettingsHelperText className="mt-0.5">/{template.slug}</SettingsHelperText>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {template.fields.map((f) => (
                          <li
                            key={f.key}
                            className="rounded-full border border-line-glass/30 bg-surface-card px-2.5 py-0.5 text-xs text-input-text"
                          >
                            {f.label}{f.required ? ' *' : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleCopyEmbed(template.slug)}
                        disabled={isSaving}
                      >
                        {copiedSlug === template.slug ? 'Copied!' : 'Copy embed'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setDeleteTarget(template)}
                        disabled={isSaving}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </SettingSection>
        )}

        {existingTemplates.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line-glass/40 p-8 text-center">
            <p className="text-sm font-medium text-input-text">No custom templates yet</p>
            <p className="mt-1 text-sm text-input-placeholder">
              Create a template to customise which fields the AI collects for a specific intake type.
            </p>
            <Button type="button" size="sm" className="mt-4" onClick={openForm}>
              + New Template
            </Button>
          </div>
        )}
      </div>

      {/* ── New template dialog ── */}
      <Dialog isOpen={isFormOpen} onClose={closeForm} title="New intake template">
        <DialogBody className="space-y-5">
          <Input
            label="Template name"
            value={draft.name}
            onChange={handleNameChange}
            placeholder="e.g. Family Law, Immigration"
            disabled={isSaving}
          />

          <Input
            label="Slug"
            description="Used in the ?template= embed parameter. Lowercase letters, numbers, hyphens."
            value={draft.slug}
            onChange={handleSlugChange}
            placeholder="e.g. family-law"
            disabled={isSaving}
            error={slugError ?? undefined}
          />

          <div>
            <p className="mb-2 text-sm font-medium text-input-text">Fields to collect</p>
            <SettingsHelperText className="mb-3">Required fields are always included and cannot be removed.</SettingsHelperText>
            <ul className="space-y-2">
              {STANDARD_FIELD_DEFINITIONS.map((field) => {
                const checked = draft.selectedKeys.has(field.key);
                const locked = field.required;
                return (
                  <li key={field.key}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                        checked
                          ? 'border-accent/40 bg-accent/5'
                          : 'border-line-glass/30 bg-surface-card'
                      } ${locked ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={locked || isSaving}
                        onChange={() => toggleField(field.key)}
                        className="h-4 w-4 rounded border-line-glass accent-[rgb(var(--accent))]"
                      />
                      <span className="flex-1 text-sm text-input-text">{field.label}</span>
                      {locked && (
                        <span className="text-xs text-input-placeholder">required</span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </DialogBody>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={closeForm} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void handleSaveTemplate()} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save template'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <Dialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete template"
      >
        <DialogBody>
          <p className="text-sm text-input-text">
            Are you sure you want to delete{' '}
            <strong>{deleteTarget?.name}</strong>?
          </p>
          <p className="mt-2 text-sm text-input-placeholder">
            Any embed codes using{' '}
            <code className="rounded bg-surface-utility px-1.5 py-0.5 font-mono text-xs">
              ?template={deleteTarget?.slug}
            </code>{' '}
            will fall back to the default template automatically.
          </p>
        </DialogBody>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => deleteTarget && void handleDeleteTemplate(deleteTarget)}
            disabled={isSaving}
          >
            {isSaving ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </Dialog>
    </SettingsPage>
  );
}
