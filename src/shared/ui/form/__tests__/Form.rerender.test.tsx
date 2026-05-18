/**
 * Form re-render isolation test.
 *
 * Plan-stated verification: "typing in any form re-renders only the field
 * being typed in." The signal-backed Form (`src/shared/ui/form/Form.tsx`)
 * stores state on a Signal that the parent Form component never reads
 * during render — so field updates flow to the field component (which
 * subscribes via useComputed) without triggering a Form re-render.
 *
 * This test mounts a Form with two fields and a render-counting parent.
 * It updates one field via setFieldValue and asserts that:
 *   - the Form-level render counter does not increment
 *   - the OTHER field's render counter does not increment
 *
 * If someone refactors Form to read .value during render (which would
 * cause field updates to re-render the whole tree), this test fails.
 */
import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/preact';
import { useRef } from 'preact/hooks';
import { useComputed } from '@preact/signals';

import { Form, useFormContext } from '@/shared/ui/form/Form';

let formRenderCount = 0;
let aRenderCount = 0;
let bRenderCount = 0;

function FieldA() {
  aRenderCount += 1;
  const ctx = useFormContext<{ a: string; b: string }>();
  const value = useComputed(() => ctx.dataSignal.value.a ?? '');
  return <span data-testid="a-value">{value.value}</span>;
}

function FieldB() {
  bRenderCount += 1;
  const ctx = useFormContext<{ a: string; b: string }>();
  const value = useComputed(() => ctx.dataSignal.value.b ?? '');
  return <span data-testid="b-value">{value.value}</span>;
}

let setA: ((v: string) => void) | null = null;
function CaptureSetters() {
  const ctx = useFormContext<{ a: string; b: string }>();
  setA = (v: string) => ctx.setFieldValue('a', v);
  return null;
}

function TestForm() {
  formRenderCount += 1;
  const idRef = useRef('test-form');
  return (
    <Form initialData={{ a: '', b: '' }} id={idRef.current}>
      <FieldA />
      <FieldB />
      <CaptureSetters />
    </Form>
  );
}

describe('Form re-render isolation', () => {
  it('updating one field does NOT re-render the parent Form or the sibling field', async () => {
    formRenderCount = 0;
    aRenderCount = 0;
    bRenderCount = 0;

    const { getByTestId } = render(<TestForm />);

    const formAfterMount = formRenderCount;
    const aAfterMount = aRenderCount;
    const bAfterMount = bRenderCount;

    await act(async () => {
      setA?.('hello');
    });

    // The signal value updated; FieldA is subscribed via useComputed and re-renders.
    expect(getByTestId('a-value').textContent).toBe('hello');
    // FieldA re-rendered (the typed field). FieldB and the Form did NOT.
    expect(aRenderCount).toBeGreaterThan(aAfterMount);
    expect(bRenderCount).toBe(bAfterMount);
    expect(formRenderCount).toBe(formAfterMount);
  });
});
