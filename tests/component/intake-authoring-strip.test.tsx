import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

import { IntakeAuthoringStrip } from '@/features/intake/components/IntakeAuthoringStrip';
import type { IntakeTemplateSuggestion } from '@/features/intake/api/intakeTemplatesApi';

const suggestion: IntakeTemplateSuggestion = {
  id: '33333333-3333-4333-8333-333333333333',
  organization_id: '11111111-1111-4111-8111-111111111111',
  template_id: '22222222-2222-4222-8222-222222222222',
  request_key: '44444444-4444-4444-8444-444444444444',
  base_revision: 4,
  instruction: 'Clarify the court deadline question',
  proposed_edits: [
    { operation: 'rephrase', field_key: 'court_deadline', changes: { label: 'Next court deadline' } },
  ],
  analytics_evidence: {
    status: 'unavailable',
    window: null,
    numerator: null,
    denominator: null,
    provenance: 'practice_client_intakes',
    reason: 'Revision attribution is unavailable.',
  },
  status: 'staged',
  created_by: '55555555-5555-4555-8555-555555555555',
  decided_by: null,
  applied_revision: null,
  created_at: '2026-07-12T00:00:00.000Z',
  decided_at: null,
};

const renderStrip = (overrides: Partial<Parameters<typeof IntakeAuthoringStrip>[0]> = {}) => {
  const props: Parameters<typeof IntakeAuthoringStrip>[0] = {
    revision: 4,
    suggestions: [],
    loadState: 'ready',
    actingSuggestionId: null,
    canLoad: true,
    onRefresh: vi.fn(),
    onApply: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
  render(<IntakeAuthoringStrip {...props} />);
  return props;
};

describe('IntakeAuthoringStrip', () => {
  it('shows the current durable revision and an honest empty state', () => {
    renderStrip();
    expect(screen.getByText('Revision 4')).toBeInTheDocument();
    expect(screen.getByText('No staged suggestions for this revision.')).toBeInTheDocument();
  });

  it('applies or dismisses a real staged suggestion through explicit actions', () => {
    const props = renderStrip({ suggestions: [suggestion] });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(props.onApply).toHaveBeenCalledWith(suggestion);
    expect(props.onDismiss).toHaveBeenCalledWith(suggestion);
  });

  it('keeps backend load failure visible and retryable', () => {
    const props = renderStrip({ loadState: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent('Suggestions could not be loaded');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(props.onRefresh).toHaveBeenCalledOnce();
  });
});
