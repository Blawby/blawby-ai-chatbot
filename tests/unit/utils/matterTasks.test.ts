import { describe, expect, it } from 'vitest';
import { toMatterTask, toTaskStageOptions } from '@/features/matters/utils/matterUtils';
import type { BackendMatterTask } from '@/features/matters/services/mattersApi';

const buildBackendTask = (overrides: Partial<BackendMatterTask> = {}): BackendMatterTask => ({
  id: 'task-1',
  matter_id: 'matter-1',
  name: 'Collect records',
  description: null,
  assignee_id: null,
  due_date: '2026-02-28',
  status: 'pending',
  priority: 'normal',
  stage: 'Discovery',
  created_at: '2026-02-20T10:00:00.000Z',
  updated_at: '2026-02-20T10:00:00.000Z',
  ...overrides
});

describe('matter task mappers', () => {
  it('maps backend task to frontend task shape', () => {
    const mapped = toMatterTask(buildBackendTask({
      description: 'Gather all documents',
      assignee_id: 'user-1'
    }));

    expect(mapped).toEqual({
      id: 'task-1',
      matterId: 'matter-1',
      name: 'Collect records',
      description: 'Gather all documents',
      assigneeId: 'user-1',
      dueDate: '2026-02-28',
      status: 'pending',
      priority: 'normal',
      stage: 'Discovery',
      createdAt: '2026-02-20T10:00:00.000Z',
      updatedAt: '2026-02-20T10:00:00.000Z'
    });
  });

  it('normalizes invalid status and priority values', () => {
    const mapped = toMatterTask(buildBackendTask({
      status: 'not_valid' as BackendMatterTask['status'],
      priority: 'not_valid' as BackendMatterTask['priority']
    }));

    expect(mapped.status).toBe('pending');
    expect(mapped.priority).toBe('normal');
  });

  it('builds deduplicated sorted stage options', () => {
    const options = toTaskStageOptions([
      toMatterTask(buildBackendTask({ id: 'a', stage: 'Review' })),
      toMatterTask(buildBackendTask({ id: 'b', stage: 'Discovery' })),
      toMatterTask(buildBackendTask({ id: 'c', stage: 'Review' })),
      toMatterTask(buildBackendTask({ id: 'd', stage: '   ' }))
    ]);

    expect(options).toEqual([
      { value: 'Discovery', label: 'Discovery' },
      { value: 'Review', label: 'Review' }
    ]);
  });
});
