import type { Env } from '../../types.js';
import { HttpErrors } from '../../errorHandler.js';
import type {
  PracticeAssistantActionStatus,
  PracticeAssistantActionSummary,
  PracticeAssistantSource,
} from './types.js';
import {
  validateActionPayload,
  getEntityConfig,
  deriveActionCopy,
  validateFieldValue,
  verifyOperations,
  type EntityRouteScope,
  type EntityConfig,
  type WritableField,
  type UpdateEntityPayload,
  type CreateEntityPayload,
  type DeleteEntityPayload,
  type RunEntityActionPayload,
} from './EntityRegistry.js';

interface ActionRow {
  id: string;
  practice_id: string;
  conversation_id: string;
  created_by_user_id: string;
  tool_use_id: string;
  tool_name: string;
  status: PracticeAssistantActionStatus;
  approval_summary_json: string;
  payload_json: string;
  result_json: string | null;
  error_message: string | null;
}

export class PracticeAssistantActionService {
  constructor(private env: Env) {}

  async createPending(input: {
    practiceId: string;
    conversationId: string;
    userId: string;
    toolUseId: string;
    toolName: string;
    summary: Omit<PracticeAssistantActionSummary, 'actionId' | 'toolUseId' | 'toolName' | 'status'>;
  }): Promise<PracticeAssistantActionSummary> {
    const actionId = crypto.randomUUID();
    await this.env.DB.prepare(`
      INSERT INTO practice_assistant_actions (
        id, practice_id, conversation_id, created_by_user_id, tool_use_id, tool_name,
        status, approval_summary_json, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).bind(
      actionId,
      input.practiceId,
      input.conversationId,
      input.userId,
      input.toolUseId,
      input.toolName,
      JSON.stringify({
        title: input.summary.title,
        description: input.summary.description,
        sources: input.summary.sources ?? [],
      }),
      JSON.stringify(input.summary.payload),
      new Date().toISOString(),
    ).run();

    await this.env.DB.prepare(`
      INSERT INTO session_audit_events (
        id, conversation_id, practice_id, event_type, actor_type, actor_id, payload, created_at
      ) VALUES (?, ?, ?, 'practice_assistant.action_created', 'system', NULL, ?, ?)
    `).bind(
      crypto.randomUUID(),
      input.conversationId,
      input.practiceId,
      JSON.stringify({
        actionId,
        toolUseId: input.toolUseId,
        toolName: input.toolName,
        status: 'pending',
      }),
      new Date().toISOString(),
    ).run();

    return {
      actionId,
      toolUseId: input.toolUseId,
      toolName: input.toolName,
      title: input.summary.title,
      description: input.summary.description,
      status: 'pending',
      payload: input.summary.payload,
      sources: input.summary.sources,
    };
  }

  async approve(actionId: string, practiceId: string): Promise<PracticeAssistantActionSummary> {
    const row = await this.getRow(actionId, practiceId);
    const result = await this.env.DB.prepare(`
      UPDATE practice_assistant_actions
      SET status = 'approved', approved_at = ?
      WHERE id = ? AND practice_id = ? AND status = 'pending'
    `).bind(new Date().toISOString(), actionId, practiceId).run();
    if (!result.meta.changes) {
      throw HttpErrors.conflict(`Action is already ${row.status}`);
    }
    return this.toSummary({ ...row, status: 'approved' });
  }

  async reject(actionId: string, practiceId: string): Promise<PracticeAssistantActionSummary> {
    const row = await this.getRow(actionId, practiceId);
    const result = await this.env.DB.prepare(`
      UPDATE practice_assistant_actions
      SET status = 'rejected', rejected_at = ?
      WHERE id = ? AND practice_id = ? AND status = 'pending'
    `).bind(new Date().toISOString(), actionId, practiceId).run();
    if (!result.meta.changes) {
      throw HttpErrors.conflict(`Action is already ${row.status}`);
    }
    return this.toSummary({ ...row, status: 'rejected' });
  }

  async executeApproved(actionId: string, practiceId: string, request: Request): Promise<PracticeAssistantActionSummary> {
    const row = await this.getRow(actionId, practiceId);
    if (row.status !== 'approved') {
      throw HttpErrors.conflict(`Action must be approved before execution. Current status: ${row.status}`);
    }
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
    try {
      const result = await this.executePayload(practiceId, payload, request);
      await this.env.DB.prepare(`
        UPDATE practice_assistant_actions
        SET status = 'executed', result_json = ?, executed_at = ?
        WHERE id = ? AND practice_id = ?
      `).bind(JSON.stringify(result ?? {}), new Date().toISOString(), actionId, practiceId).run();
      return this.toSummary({ ...row, status: 'executed', result_json: JSON.stringify(result ?? {}) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.env.DB.prepare(`
        UPDATE practice_assistant_actions
        SET status = 'failed', error_message = ?
        WHERE id = ? AND practice_id = ?
      `).bind(message, actionId, practiceId).run();
      throw error;
    }
  }

  async getRow(actionId: string, practiceId: string): Promise<ActionRow> {
    const row = await this.env.DB.prepare(`
      SELECT *
      FROM practice_assistant_actions
      WHERE id = ? AND practice_id = ?
    `).bind(actionId, practiceId).first<ActionRow>();
    if (!row) throw HttpErrors.notFound('Action not found');
    return row;
  }

  toSummary(row: ActionRow): PracticeAssistantActionSummary {
    const approval = JSON.parse(row.approval_summary_json) as {
      title?: string;
      description?: string;
      sources?: PracticeAssistantSource[];
    };
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
    return {
      actionId: row.id,
      toolUseId: row.tool_use_id,
      toolName: row.tool_name,
      title: approval.title ?? row.tool_name,
      description: approval.description ?? '',
      status: row.status,
      payload,
      sources: approval.sources ?? [],
    };
  }

  // ─── Execution ──────────────────────────────────────────────────────────────

  private async executePayload(
    practiceId: string,
    payload: Record<string, unknown>,
    request: Request,
  ): Promise<unknown> {
    const action = validateActionPayload(payload);
    switch (action.actionType) {
      case 'update_entity': return this.executeUpdateEntity(practiceId, action, request);
      case 'create_entity': return this.executeCreateEntity(practiceId, action, request);
      case 'delete_entity': return this.executeDeleteEntity(practiceId, action, request);
      case 'run_entity_action': return this.executeRunEntityAction(practiceId, action, request);
    }
  }

  private buildScope(
    practiceId: string,
    action: { id?: string; parent?: { entityType: string; id: string } },
  ): EntityRouteScope {
    const id = action.id === 'current' ? practiceId : action.id;
    return {
      practiceId,
      id,
      parentId: action.parent?.id,
      parentType: action.parent?.entityType,
    };
  }

  private requireParent(config: EntityConfig, scope: EntityRouteScope): void {
    if (config.parentEntityType && !scope.parentId) {
      throw HttpErrors.badRequest(
        `Entity type "${config.entityType}" requires a parent ${config.parentEntityType} — include parent: { entityType, id }`,
      );
    }
  }

  private async executeUpdateEntity(
    practiceId: string,
    action: UpdateEntityPayload,
    request: Request,
  ): Promise<unknown> {
    const config = getEntityConfig(action.entityType);
    if (!config.updateRoute || !config.updateMethod) {
      throw HttpErrors.badRequest(`Entity type ${action.entityType} does not support update`);
    }

    const scope = this.buildScope(practiceId, action);
    this.requireParent(config, scope);

    const writableFields = config.writableFields ?? [];
    const writableNames = new Set(
      writableFields.flatMap((f) => [f.field, ...(f.aliases ?? [])]),
    );

    for (const op of action.operations) {
      if (writableNames.size > 0 && !writableNames.has(op.field)) {
        throw HttpErrors.badRequest(`Field "${op.field}" is not writable on ${action.entityType}`);
      }
      const fieldConfig = writableFields.find(
        (f) => f.field === op.field || f.aliases?.includes(op.field),
      );
      if (fieldConfig && !fieldConfig.allowedOps.includes(op.op as never)) {
        throw HttpErrors.badRequest(
          `Operation "${op.op}" is not allowed on field "${op.field}" of ${action.entityType}`,
        );
      }
      // Validate set/replace/append/add_to_set/remove_from_set values against the field validator.
      if (fieldConfig && op.op !== 'increment') {
        validateFieldValue(fieldConfig.validator, op.value, op.field);
      }
      // Object-array set operations require a setIdentityKey.
      if ((op.op === 'add_to_set' || op.op === 'remove_from_set') && fieldConfig) {
        const isObjectArray =
          fieldConfig.validator.kind === 'array' &&
          fieldConfig.validator.items?.kind === 'object';
        if (isObjectArray && !fieldConfig.setIdentityKey) {
          throw HttpErrors.badRequest(
            `Field "${op.field}" holds objects — add an identity key (setIdentityKey) to the registry before using add_to_set/remove_from_set`,
          );
        }
      }
    }

    // For ops that need the current value, read the entity first.
    const needsReadFirst = action.operations.some(
      (op) => op.op === 'add_to_set' || op.op === 'remove_from_set' || op.op === 'append' || op.op === 'increment',
    );
    let currentEntity: Record<string, unknown> = {};
    if (needsReadFirst && config.readRoute) {
      const fetched = await this.entityFetch(config, config.readRoute(scope), request, { method: 'GET' });
      if (fetched && typeof fetched === 'object' && !Array.isArray(fetched)) {
        currentEntity = fetched as Record<string, unknown>;
      }
    }

    const patch: Record<string, unknown> = {};
    for (const op of action.operations) {
      const fieldConfig = writableFields.find(
        (f) => f.field === op.field || f.aliases?.includes(op.field),
      );
      const canonical = fieldConfig?.field ?? op.field;
      switch (op.op) {
        case 'set':
        case 'replace':
          patch[canonical] = op.value;
          break;
        case 'increment': {
          const current = typeof currentEntity[canonical] === 'number' ? (currentEntity[canonical] as number) : 0;
          patch[canonical] = current + op.delta;
          break;
        }
        case 'add_to_set': {
          const current = Array.isArray(currentEntity[canonical]) ? [...(currentEntity[canonical] as unknown[])] : [];
          const identityKey = fieldConfig?.setIdentityKey;
          const alreadyPresent = identityKey
            ? current.some(
                (item) =>
                  item && typeof item === 'object' &&
                  (item as Record<string, unknown>)[identityKey] ===
                    (op.value as Record<string, unknown>)[identityKey],
              )
            : current.includes(op.value);
          if (!alreadyPresent) current.push(op.value);
          patch[canonical] = current;
          break;
        }
        case 'remove_from_set': {
          const current = Array.isArray(currentEntity[canonical]) ? [...(currentEntity[canonical] as unknown[])] : [];
          const identityKey = fieldConfig?.setIdentityKey;
          patch[canonical] = identityKey
            ? current.filter(
                (item) =>
                  !(item && typeof item === 'object' &&
                    (item as Record<string, unknown>)[identityKey] ===
                      (op.value as Record<string, unknown>)[identityKey]),
              )
            : current.filter((item) => item !== op.value);
          break;
        }
        case 'append': {
          // String fields: text concatenation. Array fields: push. All others: reject.
          if (fieldConfig?.validator.kind === 'string') {
            const current = typeof currentEntity[canonical] === 'string' ? currentEntity[canonical] as string : '';
            if (typeof op.value !== 'string') {
              throw HttpErrors.badRequest(`Append on string field "${op.field}" requires a string value`);
            }
            patch[canonical] = current + op.value;
          } else if (!fieldConfig || fieldConfig.validator.kind === 'array') {
            const current = Array.isArray(currentEntity[canonical]) ? [...(currentEntity[canonical] as unknown[])] : [];
            current.push(op.value);
            patch[canonical] = current;
          } else {
            throw HttpErrors.badRequest(
              `Append is not supported for field "${op.field}" of type "${fieldConfig.validator.kind}"`,
            );
          }
          break;
        }
      }
    }

    const updated = await this.entityFetch(config, config.updateRoute(scope), request, {
      method: config.updateMethod,
      body: patch,
    });

    if (config.readRoute) {
      const verified = await this.entityFetch(config, config.readRoute(scope), request, { method: 'GET' });
      const verifiedRecord =
        verified && typeof verified === 'object' && !Array.isArray(verified)
          ? (verified as Record<string, unknown>)
          : {};
      const failures = verifyOperations(action.operations, verifiedRecord, writableFields);
      if (failures.length > 0) {
        throw new Error(`Update verification failed: ${failures.join('; ')}`);
      }
      return { updated, verified };
    }
    return { updated };
  }

  private async executeCreateEntity(
    practiceId: string,
    action: CreateEntityPayload,
    request: Request,
  ): Promise<unknown> {
    const config = getEntityConfig(action.entityType);
    if (!config.createRoute) {
      throw HttpErrors.badRequest(`Entity type ${action.entityType} does not support create`);
    }

    const scope = this.buildScope(practiceId, action as never);
    this.requireParent(config, scope);

    // Use creatableFields when defined; fall back to writableFields.
    const createFields: WritableField[] | undefined =
      config.creatableFields ?? (config.writableFields?.length ? config.writableFields : undefined);

    if (createFields && createFields.length > 0) {
      const allowedNames = new Set(
        createFields.flatMap((f) => [f.field, ...(f.aliases ?? [])]),
      );
      for (const key of Object.keys(action.data)) {
        if (!allowedNames.has(key)) {
          throw HttpErrors.badRequest(
            `Field "${key}" is not a recognized creatable field on ${action.entityType}`,
          );
        }
      }
      // Validate values against field validators.
      for (const fieldConfig of createFields) {
        const value = action.data[fieldConfig.field] ??
          fieldConfig.aliases?.map((a) => action.data[a]).find((v) => v !== undefined);
        if (value !== undefined) {
          validateFieldValue(fieldConfig.validator, value, fieldConfig.field);
        }
      }
    }

    // Enforce required fields (only when creatableFields declared).
    if (config.creatableFields && config.requiredCreateFields) {
      const createFieldAliases = new Map<string, string[]>();
      for (const f of config.creatableFields) {
        createFieldAliases.set(f.field, f.aliases ?? []);
      }
      for (const required of config.requiredCreateFields) {
        const aliases = createFieldAliases.get(required) ?? [];
        const present = [required, ...aliases].some((name) => action.data[name] !== undefined);
        if (!present) {
          throw HttpErrors.badRequest(
            `Field "${required}" is required when creating ${action.entityType}`,
          );
        }
      }
    }

    const created = await this.entityFetch(config, config.createRoute(scope), request, {
      method: 'POST',
      body: action.data,
    });
    return { created };
  }

  private async executeDeleteEntity(
    practiceId: string,
    action: DeleteEntityPayload,
    request: Request,
  ): Promise<unknown> {
    const config = getEntityConfig(action.entityType);
    if (!config.deleteRoute) {
      throw HttpErrors.badRequest(`Entity type ${action.entityType} does not support delete`);
    }

    const scope = this.buildScope(practiceId, action);
    this.requireParent(config, scope);

    await this.entityFetch(config, config.deleteRoute(scope), request, { method: 'DELETE' });

    // Verify hard deletes: if the entity is still readable, the delete failed.
    if ((config.deleteSemantics ?? 'delete') === 'delete' && config.readRoute) {
      try {
        await this.entityFetch(config, config.readRoute(scope), request, { method: 'GET' });
        // If we reach here the entity still exists — delete did not take effect.
        throw new Error(`Delete verification failed: ${action.entityType} ${action.id} is still readable after delete`);
      } catch (error) {
        // A fetch error (e.g. 404) means the entity is gone — that's the success case.
        // Re-throw only our own verification failure.
        if (error instanceof Error && error.message.startsWith('Delete verification failed:')) throw error;
      }
    }

    return {
      deleted: true,
      entityType: action.entityType,
      id: action.id,
      semantics: config.deleteSemantics ?? 'delete',
    };
  }

  private async executeRunEntityAction(
    practiceId: string,
    action: RunEntityActionPayload,
    request: Request,
  ): Promise<unknown> {
    const config = getEntityConfig(action.entityType);
    const lifecycleAction = config.lifecycleActions?.find((a) => a.action === action.action);
    if (!lifecycleAction) {
      throw HttpErrors.badRequest(
        `Action "${action.action}" is not supported for entity type ${action.entityType}. ` +
        `Supported actions: ${(config.lifecycleActions ?? []).map((a) => a.action).join(', ') || 'none'}`,
      );
    }

    const scope = this.buildScope(practiceId, action);
    this.requireParent(config, scope);

    // Validate input against declared schema if present.
    if (lifecycleAction.inputSchema) {
      const result = lifecycleAction.inputSchema.safeParse(action.input ?? {});
      if (!result.success) {
        throw HttpErrors.badRequest(
          `Invalid input for action "${action.action}": ${result.error.message}`,
        );
      }
    }

    const result = await this.entityFetch(config, lifecycleAction.route(scope), request, {
      method: lifecycleAction.method,
      body: action.input ?? {},
    });

    if (lifecycleAction.verifyReadRoute) {
      const verified = await this.entityFetch(config, lifecycleAction.verifyReadRoute(scope), request, { method: 'GET' });
      return { result, verified };
    }
    return { result };
  }

  // ─── Transport ───────────────────────────────────────────────────────────────

  /**
   * Dispatch to backend or worker depending on entity owner.
   * Worker-owned entities (owner: "worker") call the worker's own routes via self-fetch,
   * forwarding the original auth headers so the route's auth checks pass.
   */
  private entityFetch(
    config: EntityConfig,
    path: string,
    request: Request,
    init: { method: string; body?: unknown },
  ): Promise<unknown> {
    return config.owner === 'worker'
      ? this.workerFetch(path, request, init)
      : this.backendFetch(path, request, init);
  }

  private async workerFetch(
    path: string,
    request: Request,
    init: { method: string; body?: unknown },
  ): Promise<unknown> {
    const origin = new URL(request.url).origin;
    return this.doFetch(`${origin}${path}`, request, init);
  }

  private async backendFetch(
    path: string,
    request: Request,
    init: { method: string; body?: unknown },
  ): Promise<unknown> {
    const base = this.env.BACKEND_API_URL?.trim();
    if (!base) throw HttpErrors.internalServerError('BACKEND_API_URL is required');
    return this.doFetch(`${base.replace(/\/+$/, '')}${path}`, request, init);
  }

  private async doFetch(
    url: string,
    request: Request,
    init: { method: string; body?: unknown },
  ): Promise<unknown> {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    const cookie = request.headers.get('Cookie');
    const authorization = request.headers.get('Authorization');
    if (cookie) headers.set('Cookie', cookie);
    if (authorization) headers.set('Authorization', authorization);
    const response = await fetch(url, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await response.text().catch(() => '');
    let payload: unknown = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = null; }
    }
    if (!response.ok) {
      const record =
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : {};
      const message =
        typeof record.error === 'string'
          ? record.error
          : typeof record.message === 'string'
            ? record.message
            : `Request failed with HTTP ${response.status}`;
      throw new Error(message);
    }
    return payload;
  }
}

// Re-export for callers that import deriveActionCopy from this module.
export { deriveActionCopy };
