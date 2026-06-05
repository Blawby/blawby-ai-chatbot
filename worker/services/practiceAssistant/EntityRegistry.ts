import { z } from "zod";
import { HttpErrors } from "../../errorHandler.js";
import type { PracticeAssistantSource } from "./types.js";

// ─── Route scope ──────────────────────────────────────────────────────────────

export interface EntityRouteScope {
  practiceId: string;
  id?: string;
  parentId?: string;
  parentType?: string;
}

export type RouteBuilder = (scope: EntityRouteScope) => string;

// ─── Field descriptors ────────────────────────────────────────────────────────

export type OpName =
  | "set"
  | "replace"
  | "append"
  | "add_to_set"
  | "remove_from_set"
  | "increment";

export type FieldValidator =
  | { kind: "string"; minLength?: number; maxLength?: number }
  | { kind: "enum"; values: readonly string[] }
  | { kind: "email" }
  | { kind: "date" }
  | { kind: "money"; min?: number; max?: number }
  | { kind: "number"; min?: number; max?: number; integer?: boolean }
  | { kind: "boolean" }
  | { kind: "array"; items?: FieldValidator }
  | { kind: "object"; schema?: Record<string, FieldValidator> };

export interface WritableField {
  field: string;
  aliases?: string[];
  /** Typed contract for this field's values. */
  validator: FieldValidator;
  description?: string;
  /**
   * Operations allowed on this field. Required — fail-closed.
   * Empty array means the field cannot be written via the assistant.
   */
  allowedOps: OpName[];
  /**
   * For array fields holding objects, the property key used to identify items
   * for add_to_set / remove_from_set deduplication. Required for object arrays;
   * set operations on object arrays without this key are rejected.
   */
  setIdentityKey?: string;
}

// ─── Lifecycle actions ────────────────────────────────────────────────────────

export type DeleteSemantics = "delete" | "soft_delete" | "archive" | "unlink";

export interface LifecycleAction {
  action: string;
  description: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  route: RouteBuilder;
  deleteSemantics?: DeleteSemantics;
  /** Zod schema validating the input payload for this action. */
  inputSchema?: z.ZodType;
  /** If defined, read this route after the action completes and include the result. */
  verifyReadRoute?: RouteBuilder;
}

// ─── EntityConfig ─────────────────────────────────────────────────────────────

export interface EntityConfig {
  entityType: string;
  owner: "backend" | "worker";
  /**
   * When set, this entity is a child of another entity type and mutations
   * require a parent scope (scope.parentId must be provided).
   */
  parentEntityType?: string;
  readRoute?: RouteBuilder;
  listRoute?: RouteBuilder;
  createRoute?: RouteBuilder;
  updateRoute?: RouteBuilder;
  updateMethod?: "PUT" | "PATCH";
  deleteRoute?: RouteBuilder;
  deleteSemantics?: DeleteSemantics;
  writableFields?: WritableField[];
  /**
   * Fields allowed on create. When defined, used instead of writableFields for
   * create validation. Allows a different contract for create vs update.
   */
  creatableFields?: WritableField[];
  /** Fields required on create. Only enforced when creatableFields is defined. */
  requiredCreateFields?: string[];
  lifecycleActions?: LifecycleAction[];
  listKeys?: string[];
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const enc = encodeURIComponent;

export const ENTITY_REGISTRY: Record<string, EntityConfig> = {
  // ── Practice ────────────────────────────────────────────────────────────────
  practice: {
    entityType: "practice",
    owner: "backend",
    readRoute: ({ practiceId }) => `/api/practice/${enc(practiceId)}`,
    updateRoute: ({ practiceId }) => `/api/practice/${enc(practiceId)}`,
    updateMethod: "PUT",
    writableFields: [
      {
        field: "name",
        aliases: ["practiceName", "firmName", "firm_name"],
        validator: { kind: "string", minLength: 1, maxLength: 200 },
        description: "Display name of the practice",
        allowedOps: ["set"],
      },
    ],
  },

  practice_details: {
    entityType: "practice_details",
    owner: "backend",
    readRoute: ({ practiceId }) => `/api/practice/${enc(practiceId)}/details`,
    updateRoute: ({ practiceId }) => `/api/practice/${enc(practiceId)}/details`,
    updateMethod: "PUT",
    writableFields: [
      {
        field: "services",
        aliases: ["practiceAreas", "practice_areas", "areasOfLaw", "areas_of_law"],
        validator: { kind: "array", items: { kind: "object" } },
        description: "Array of practice-area service objects { key, name }",
        allowedOps: ["set", "replace", "add_to_set", "remove_from_set"],
        setIdentityKey: "key",
      },
    ],
  },

  // ── Matters ─────────────────────────────────────────────────────────────────
  matter: {
    entityType: "matter",
    owner: "backend",
    readRoute: ({ practiceId, id }) => `/api/matters/${enc(practiceId)}/${enc(id!)}`,
    listRoute: ({ practiceId }) => `/api/matters/${enc(practiceId)}`,
    createRoute: ({ practiceId }) => `/api/matters/${enc(practiceId)}`,
    updateRoute: ({ practiceId, id }) => `/api/matters/${enc(practiceId)}/${enc(id!)}`,
    updateMethod: "PUT",
    deleteRoute: ({ practiceId, id }) => `/api/matters/${enc(practiceId)}/${enc(id!)}`,
    deleteSemantics: "delete",
    writableFields: [
      { field: "title", validator: { kind: "string", minLength: 1 }, allowedOps: ["set"] },
      { field: "status", validator: { kind: "string" }, description: "Matter status, e.g. open, closed, pending", allowedOps: ["set"] },
      { field: "description", validator: { kind: "string" }, allowedOps: ["set", "replace"] },
      { field: "client_id", aliases: ["clientId"], validator: { kind: "string", minLength: 1 }, allowedOps: ["set"] },
      { field: "billing_type", aliases: ["billingType"], validator: { kind: "enum", values: ["hourly", "flat_fee", "contingency", "retainer"] as const }, allowedOps: ["set"] },
      { field: "hourly_rate", aliases: ["hourlyRate"], validator: { kind: "money", min: 0 }, allowedOps: ["set", "increment"] },
      { field: "flat_fee", aliases: ["flatFee"], validator: { kind: "money", min: 0 }, allowedOps: ["set", "increment"] },
      { field: "opened_at", aliases: ["openedAt"], validator: { kind: "date" }, allowedOps: ["set"] },
      { field: "closed_at", aliases: ["closedAt"], validator: { kind: "date" }, allowedOps: ["set"] },
    ],
    listKeys: ["matters", "items", "results"],
  },

  /**
   * Child of matter. Requires parent: { entityType: "matter", id: matterId }.
   */
  matter_task: {
    entityType: "matter_task",
    owner: "backend",
    parentEntityType: "matter",
    readRoute: ({ practiceId, parentId, id }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/tasks/${enc(id!)}`,
    listRoute: ({ practiceId, parentId }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/tasks`,
    createRoute: ({ practiceId, parentId }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/tasks`,
    updateRoute: ({ practiceId, parentId, id }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/tasks/${enc(id!)}`,
    updateMethod: "PUT",
    deleteRoute: ({ practiceId, parentId, id }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/tasks/${enc(id!)}`,
    deleteSemantics: "delete",
    writableFields: [
      { field: "title", validator: { kind: "string", minLength: 1 }, allowedOps: ["set"] },
      { field: "description", validator: { kind: "string" }, allowedOps: ["set", "replace"] },
      { field: "status", validator: { kind: "enum", values: ["pending", "in_progress", "completed", "cancelled"] as const }, allowedOps: ["set"] },
      { field: "due_date", aliases: ["dueDate"], validator: { kind: "date" }, allowedOps: ["set"] },
      { field: "assigned_to", aliases: ["assignedTo"], validator: { kind: "string" }, allowedOps: ["set"] },
      { field: "priority", validator: { kind: "enum", values: ["low", "normal", "high", "urgent"] as const }, allowedOps: ["set"] },
    ],
    listKeys: ["tasks", "items", "results"],
  },

  /**
   * Child of matter. Requires parent: { entityType: "matter", id: matterId }.
   */
  matter_note: {
    entityType: "matter_note",
    owner: "backend",
    parentEntityType: "matter",
    readRoute: ({ practiceId, parentId, id }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/notes/${enc(id!)}`,
    listRoute: ({ practiceId, parentId }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/notes`,
    createRoute: ({ practiceId, parentId }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/notes`,
    updateRoute: ({ practiceId, parentId, id }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/notes/${enc(id!)}`,
    updateMethod: "PUT",
    deleteRoute: ({ practiceId, parentId, id }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/notes/${enc(id!)}`,
    deleteSemantics: "delete",
    writableFields: [
      { field: "title", validator: { kind: "string" }, allowedOps: ["set"] },
      { field: "content", validator: { kind: "string" }, allowedOps: ["set", "replace", "append"] },
      { field: "visibility", validator: { kind: "enum", values: ["internal", "shared"] as const }, allowedOps: ["set"] },
    ],
    listKeys: ["notes", "items", "results"],
  },

  /**
   * Child of matter. Requires parent: { entityType: "matter", id: matterId }.
   * Use the "reorder" lifecycle action to change milestone ordering.
   */
  matter_milestone: {
    entityType: "matter_milestone",
    owner: "backend",
    parentEntityType: "matter",
    readRoute: ({ practiceId, parentId, id }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/milestones/${enc(id!)}`,
    listRoute: ({ practiceId, parentId }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/milestones`,
    createRoute: ({ practiceId, parentId }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/milestones`,
    updateRoute: ({ practiceId, parentId, id }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/milestones/${enc(id!)}`,
    updateMethod: "PUT",
    deleteRoute: ({ practiceId, parentId, id }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/milestones/${enc(id!)}`,
    deleteSemantics: "delete",
    writableFields: [
      { field: "title", validator: { kind: "string", minLength: 1 }, allowedOps: ["set"] },
      { field: "description", validator: { kind: "string" }, allowedOps: ["set", "replace"] },
      { field: "due_date", aliases: ["dueDate"], validator: { kind: "date" }, allowedOps: ["set"] },
      { field: "status", validator: { kind: "enum", values: ["pending", "completed"] as const }, allowedOps: ["set"] },
      { field: "order", validator: { kind: "number", integer: true, min: 0 }, allowedOps: ["set", "increment"] },
    ],
    lifecycleActions: [
      {
        action: "reorder",
        description: "Reorder milestones within a matter by providing an ordered list of milestone IDs.",
        method: "POST",
        route: ({ practiceId, parentId }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/milestones/reorder`,
        inputSchema: z.object({
          ids: z.array(z.string().min(1)).min(1),
        }),
      },
    ],
    listKeys: ["milestones", "items", "results"],
  },

  /**
   * Child of matter. Requires parent: { entityType: "matter", id: matterId }.
   */
  matter_expense: {
    entityType: "matter_expense",
    owner: "backend",
    parentEntityType: "matter",
    readRoute: ({ practiceId, parentId, id }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/expenses/${enc(id!)}`,
    listRoute: ({ practiceId, parentId }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/expenses`,
    createRoute: ({ practiceId, parentId }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/expenses`,
    updateRoute: ({ practiceId, parentId, id }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/expenses/${enc(id!)}`,
    updateMethod: "PUT",
    deleteRoute: ({ practiceId, parentId, id }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/expenses/${enc(id!)}`,
    deleteSemantics: "delete",
    writableFields: [
      { field: "description", validator: { kind: "string", minLength: 1 }, allowedOps: ["set"] },
      { field: "amount", validator: { kind: "money", min: 0 }, allowedOps: ["set", "increment"] },
      { field: "date", validator: { kind: "date" }, allowedOps: ["set"] },
      { field: "category", validator: { kind: "string" }, allowedOps: ["set"] },
      { field: "billable", validator: { kind: "boolean" }, allowedOps: ["set"] },
    ],
    listKeys: ["expenses", "items", "results"],
  },

  /**
   * Child of matter. Requires parent: { entityType: "matter", id: matterId }.
   */
  time_entry: {
    entityType: "time_entry",
    owner: "backend",
    parentEntityType: "matter",
    readRoute: ({ practiceId, parentId, id }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/time-entries/${enc(id!)}`,
    listRoute: ({ practiceId, parentId }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/time-entries`,
    createRoute: ({ practiceId, parentId }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/time-entries`,
    updateRoute: ({ practiceId, parentId, id }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/time-entries/${enc(id!)}`,
    updateMethod: "PUT",
    deleteRoute: ({ practiceId, parentId, id }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/time-entries/${enc(id!)}`,
    deleteSemantics: "delete",
    writableFields: [
      { field: "description", validator: { kind: "string" }, allowedOps: ["set"] },
      { field: "duration_minutes", aliases: ["durationMinutes", "minutes"], validator: { kind: "number", integer: true, min: 1 }, allowedOps: ["set", "increment"] },
      { field: "date", validator: { kind: "date" }, allowedOps: ["set"] },
      { field: "billable", validator: { kind: "boolean" }, allowedOps: ["set"] },
      { field: "hourly_rate", aliases: ["hourlyRate"], validator: { kind: "money", min: 0 }, allowedOps: ["set"] },
    ],
    listKeys: ["time_entries", "entries", "items", "results"],
  },

  /**
   * File attachment on a matter. Requires parent: { entityType: "matter", id: matterId } for create.
   * No writable fields — create supplies the upload ID; delete unlinks.
   */
  matter_file_link: {
    entityType: "matter_file_link",
    owner: "backend",
    parentEntityType: "matter",
    listRoute: ({ practiceId, parentId }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/files`,
    createRoute: ({ practiceId, parentId }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/files`,
    deleteRoute: ({ practiceId, parentId, id }) => `/api/matters/${enc(practiceId)}/${enc(parentId!)}/files/${enc(id!)}`,
    deleteSemantics: "unlink",
    writableFields: [],
    creatableFields: [
      { field: "upload_id", aliases: ["uploadId"], validator: { kind: "string", minLength: 1 }, allowedOps: ["set"] },
    ],
    requiredCreateFields: ["upload_id"],
    listKeys: ["files", "items", "results"],
  },

  // ── Clients ─────────────────────────────────────────────────────────────────
  client: {
    entityType: "client",
    owner: "backend",
    readRoute: ({ practiceId, id }) => `/api/clients/${enc(practiceId)}/${enc(id!)}`,
    updateRoute: ({ practiceId, id }) => `/api/clients/${enc(practiceId)}/${enc(id!)}`,
    updateMethod: "PATCH",
    writableFields: [
      { field: "name", validator: { kind: "string", minLength: 1 }, allowedOps: ["set"] },
      { field: "email", validator: { kind: "email" }, allowedOps: ["set"] },
      { field: "phone", validator: { kind: "string" }, allowedOps: ["set"] },
      { field: "notes", validator: { kind: "string" }, allowedOps: ["set", "replace", "append"] },
    ],
  },

  /**
   * Child of client. Requires parent: { entityType: "client", id: clientId }.
   */
  client_memo: {
    entityType: "client_memo",
    owner: "backend",
    parentEntityType: "client",
    readRoute: ({ practiceId, parentId, id }) =>
      `/api/clients/${enc(practiceId)}/${enc(parentId!)}/memos/${enc(id!)}`,
    listRoute: ({ practiceId, parentId }) =>
      `/api/clients/${enc(practiceId)}/${enc(parentId!)}/memos`,
    createRoute: ({ practiceId, parentId }) =>
      `/api/clients/${enc(practiceId)}/${enc(parentId!)}/memos`,
    updateRoute: ({ practiceId, parentId, id }) =>
      `/api/clients/${enc(practiceId)}/${enc(parentId!)}/memos/${enc(id!)}`,
    updateMethod: "PATCH",
    deleteRoute: ({ practiceId, parentId, id }) =>
      `/api/clients/${enc(practiceId)}/${enc(parentId!)}/memos/${enc(id!)}`,
    deleteSemantics: "delete",
    writableFields: [
      { field: "title", validator: { kind: "string" }, allowedOps: ["set"] },
      { field: "content", validator: { kind: "string", minLength: 1 }, allowedOps: ["set", "replace", "append"] },
    ],
    listKeys: ["memos", "items", "results"],
  },

  // ── Intakes ─────────────────────────────────────────────────────────────────
  intake: {
    entityType: "intake",
    owner: "backend",
    readRoute: ({ practiceId, id }) =>
      `/api/practice-client-intakes/${enc(practiceId)}/${enc(id!)}`,
    listRoute: ({ practiceId }) =>
      `/api/practice-client-intakes/${enc(practiceId)}`,
    writableFields: [],
    lifecycleActions: [
      {
        action: "convert",
        description: "Convert intake to a matter or engagement.",
        method: "POST",
        route: ({ practiceId, id }) => `/api/practice-client-intakes/${enc(practiceId)}/${enc(id!)}/convert`,
        inputSchema: z.object({
          target: z.enum(["matter", "engagement"]),
          title: z.string().min(1).optional(),
        }),
      },
      {
        action: "update_status",
        description: "Update triage status of an intake.",
        method: "PUT",
        route: ({ practiceId, id }) => `/api/practice-client-intakes/${enc(practiceId)}/${enc(id!)}/status`,
        inputSchema: z.object({
          status: z.string().min(1),
        }),
      },
    ],
    listKeys: ["intakes", "items", "results"],
  },

  // ── Invoices ─────────────────────────────────────────────────────────────────
  invoice: {
    entityType: "invoice",
    owner: "backend",
    readRoute: ({ practiceId, id }) => `/api/invoices/${enc(practiceId)}/${enc(id!)}`,
    listRoute: ({ practiceId }) => `/api/invoices/${enc(practiceId)}`,
    createRoute: ({ practiceId }) => `/api/invoices/${enc(practiceId)}`,
    updateRoute: ({ practiceId, id }) => `/api/invoices/${enc(practiceId)}/${enc(id!)}`,
    updateMethod: "PATCH",
    deleteRoute: ({ practiceId, id }) => `/api/invoices/${enc(practiceId)}/${enc(id!)}`,
    deleteSemantics: "delete",
    writableFields: [
      { field: "status", validator: { kind: "string" }, allowedOps: ["set"] },
      { field: "due_date", aliases: ["dueDate"], validator: { kind: "date" }, allowedOps: ["set"] },
      { field: "description", validator: { kind: "string" }, allowedOps: ["set", "replace"] },
      { field: "matter_id", aliases: ["matterId"], validator: { kind: "string" }, allowedOps: ["set"] },
    ],
    lifecycleActions: [
      {
        action: "send",
        description: "Send invoice to client.",
        method: "POST",
        route: ({ practiceId, id }) => `/api/invoices/${enc(practiceId)}/${enc(id!)}/send`,
        inputSchema: z.record(z.string(), z.unknown()),
      },
      {
        action: "void",
        description: "Void invoice, making it non-payable.",
        method: "POST",
        route: ({ practiceId, id }) => `/api/invoices/${enc(practiceId)}/${enc(id!)}/void`,
        inputSchema: z.object({ reason: z.string().optional() }),
      },
      {
        action: "sync",
        description: "Sync invoice with external accounting system.",
        method: "POST",
        route: ({ practiceId, id }) => `/api/invoices/${enc(practiceId)}/${enc(id!)}/sync`,
        inputSchema: z.record(z.string(), z.unknown()),
      },
    ],
    listKeys: ["invoices", "items", "results"],
  },

  // ── Engagements ──────────────────────────────────────────────────────────────
  engagement: {
    entityType: "engagement",
    owner: "backend",
    readRoute: ({ practiceId, id }) =>
      `/api/engagement-contracts/${enc(practiceId)}/${enc(id!)}`,
    listRoute: ({ practiceId }) =>
      `/api/engagement-contracts/${enc(practiceId)}`,
    createRoute: ({ practiceId }) =>
      `/api/engagement-contracts/${enc(practiceId)}`,
    updateRoute: ({ practiceId, id }) =>
      `/api/engagement-contracts/${enc(practiceId)}/${enc(id!)}`,
    updateMethod: "PATCH",
    deleteRoute: ({ practiceId, id }) =>
      `/api/engagement-contracts/${enc(practiceId)}/${enc(id!)}`,
    deleteSemantics: "delete",
    writableFields: [
      { field: "title", validator: { kind: "string", minLength: 1 }, allowedOps: ["set"] },
      { field: "status", validator: { kind: "string" }, allowedOps: ["set"] },
      { field: "description", validator: { kind: "string" }, allowedOps: ["set", "replace"] },
      { field: "matter_id", aliases: ["matterId"], validator: { kind: "string" }, allowedOps: ["set"] },
      { field: "client_id", aliases: ["clientId"], validator: { kind: "string" }, allowedOps: ["set"] },
    ],
    lifecycleActions: [
      {
        action: "update_status",
        description: "Update the status of an engagement contract.",
        method: "PATCH",
        route: ({ practiceId, id }) =>
          `/api/engagement-contracts/${enc(practiceId)}/${enc(id!)}/status`,
        inputSchema: z.object({ status: z.string().min(1) }),
      },
    ],
    listKeys: ["engagements", "contracts", "items", "results"],
  },

  // ── Preferences ──────────────────────────────────────────────────────────────
  /**
   * Practice preference category. id is the category name (e.g. "billing", "notifications").
   */
  preference: {
    entityType: "preference",
    owner: "backend",
    readRoute: ({ id }) => `/api/preferences/${enc(id!)}`,
    listRoute: () => `/api/preferences`,
    updateRoute: ({ id }) => `/api/preferences/${enc(id!)}`,
    updateMethod: "PUT",
    writableFields: [
      {
        field: "value",
        validator: { kind: "object" },
        description: "Full preference value object for this category",
        allowedOps: ["set", "replace"],
      },
    ],
    listKeys: ["preferences", "categories", "items"],
  },

  // ── Conversations (worker-owned) ─────────────────────────────────────────────
  conversation: {
    entityType: "conversation",
    owner: "worker",
    readRoute: ({ id }) => `/api/conversations/${enc(id!)}`,
    listRoute: ({ practiceId }) =>
      `/api/conversations?practiceId=${enc(practiceId)}`,
    updateRoute: ({ id }) => `/api/conversations/${enc(id!)}`,
    updateMethod: "PATCH",
    deleteRoute: ({ id }) => `/api/conversations/${enc(id!)}`,
    deleteSemantics: "delete",
    writableFields: [
      {
        field: "status",
        validator: { kind: "enum", values: ["active", "archived", "closed"] as const },
        allowedOps: ["set"],
      },
      {
        field: "assignedTo",
        aliases: ["assigned_to"],
        validator: { kind: "string" },
        description: "User ID to assign the conversation to, or null to unassign",
        allowedOps: ["set"],
      },
      {
        field: "priority",
        validator: { kind: "enum", values: ["low", "normal", "high", "urgent"] as const },
        allowedOps: ["set"],
      },
      {
        field: "internalNotes",
        aliases: ["internal_notes"],
        validator: { kind: "string" },
        allowedOps: ["set", "replace", "append"],
      },
    ],
    listKeys: ["conversations", "items", "results"],
  },
};

export const getEntityConfig = (entityType: string): EntityConfig => {
  const config = ENTITY_REGISTRY[entityType];
  if (!config)
    throw HttpErrors.badRequest(`Unsupported entity type: ${entityType}`);
  return config;
};

export const findEntityConfig = (entityType: string): EntityConfig | undefined =>
  ENTITY_REGISTRY[entityType];

// ─── Operation schema ─────────────────────────────────────────────────────────

export const operationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set"), field: z.string().min(1), value: z.unknown() }).strict(),
  z.object({ op: z.literal("replace"), field: z.string().min(1), value: z.unknown() }).strict(),
  z.object({ op: z.literal("append"), field: z.string().min(1), value: z.unknown() }).strict(),
  z.object({ op: z.literal("add_to_set"), field: z.string().min(1), value: z.unknown() }).strict(),
  z.object({ op: z.literal("remove_from_set"), field: z.string().min(1), value: z.unknown() }).strict(),
  z.object({ op: z.literal("increment"), field: z.string().min(1), delta: z.number() }).strict(),
]);

export type Operation = z.infer<typeof operationSchema>;

// ─── Action payload schemas ───────────────────────────────────────────────────

const sourceSchema = z.object({
  type: z.enum([
    "client",
    "intake",
    "matter",
    "matter_task",
    "matter_note",
    "matter_milestone",
    "matter_expense",
    "time_entry",
    "matter_file_link",
    "client_memo",
    "engagement",
    "invoice",
    "report",
    "task",
    "search",
    "practice",
    "preference",
    "conversation",
  ]),
  id: z.string(),
  label: z.string(),
  href: z.string().optional(),
});

const parentTargetSchema = z.object({
  entityType: z.string().min(1),
  id: z.string().min(1),
});

const entityTypeValues = Object.keys(ENTITY_REGISTRY) as [string, ...string[]];
const entityTypeSchema = z.enum(entityTypeValues);

export const createEntitySchema = z
  .object({
    actionType: z.literal("create_entity"),
    entityType: entityTypeSchema,
    /** For child entities, identifies the parent record. */
    parent: parentTargetSchema.optional(),
    data: z.record(z.string(), z.unknown()),
    rationale: z.string().min(1).optional().nullable(),
    sources: z.array(sourceSchema).optional(),
  })
  .strict();

export const updateEntitySchema = z
  .object({
    actionType: z.literal("update_entity"),
    entityType: entityTypeSchema,
    id: z.string().min(1),
    /** For child entities, identifies the parent record. */
    parent: parentTargetSchema.optional(),
    operations: z.array(operationSchema).min(1),
    rationale: z.string().min(1).optional().nullable(),
    sources: z.array(sourceSchema).optional(),
  })
  .strict();

export const deleteEntitySchema = z
  .object({
    actionType: z.literal("delete_entity"),
    entityType: entityTypeSchema,
    id: z.string().min(1),
    /** For child entities, identifies the parent record. */
    parent: parentTargetSchema.optional(),
    rationale: z.string().min(1).optional().nullable(),
    sources: z.array(sourceSchema).optional(),
  })
  .strict();

export const runEntityActionSchema = z
  .object({
    actionType: z.literal("run_entity_action"),
    entityType: entityTypeSchema,
    id: z.string().min(1),
    /** For child entities, identifies the parent record. */
    parent: parentTargetSchema.optional(),
    action: z.string().min(1),
    input: z.record(z.string(), z.unknown()).optional(),
    rationale: z.string().min(1).optional().nullable(),
    sources: z.array(sourceSchema).optional(),
  })
  .strict();

export const actionPayloadSchema = z.discriminatedUnion("actionType", [
  createEntitySchema,
  updateEntitySchema,
  deleteEntitySchema,
  runEntityActionSchema,
]);

export type CreateEntityPayload = z.infer<typeof createEntitySchema>;
export type UpdateEntityPayload = z.infer<typeof updateEntitySchema>;
export type DeleteEntityPayload = z.infer<typeof deleteEntitySchema>;
export type RunEntityActionPayload = z.infer<typeof runEntityActionSchema>;
export type ActionPayload = z.infer<typeof actionPayloadSchema>;

export const validateActionPayload = (
  payload: Record<string, unknown>,
): ActionPayload => {
  const result = actionPayloadSchema.safeParse(payload);
  if (!result.success) {
    throw HttpErrors.badRequest(
      `Invalid action payload: ${result.error.message}`,
    );
  }
  return result.data;
};

// ─── Copy derivation ──────────────────────────────────────────────────────────

const opVerbMap: Record<OpName, string> = {
  set: "Set",
  replace: "Replace",
  append: "Append to",
  add_to_set: "Add to",
  remove_from_set: "Remove from",
  increment: "Increment",
};

const deleteVerbMap: Record<DeleteSemantics, string> = {
  delete: "Permanently delete",
  soft_delete: "Delete",
  archive: "Archive",
  unlink: "Unlink",
};

export const deriveActionCopy = (
  payload: ActionPayload,
): { title: string; description: string } => {
  const label = (entityType: string) => entityType.replace(/_/g, " ");
  switch (payload.actionType) {
    case "create_entity":
      return {
        title: `Create ${label(payload.entityType)}`,
        description: `Create a new ${label(payload.entityType)} record.`,
      };
    case "update_entity": {
      const opSummaries = payload.operations.map((op) => {
        const verb = opVerbMap[op.op] ?? "Update";
        if (op.op === "increment") {
          const sign = op.delta >= 0 ? "+" : "";
          return `${verb} ${op.field} by ${sign}${op.delta}`;
        }
        return `${verb} ${op.field}`;
      });
      return {
        title: `Update ${label(payload.entityType)}`,
        description: `${opSummaries.join("; ")} on ${label(payload.entityType)} ${payload.id}.`,
      };
    }
    case "delete_entity": {
      const config = ENTITY_REGISTRY[payload.entityType];
      const semantics = config?.deleteSemantics ?? "delete";
      const verb = deleteVerbMap[semantics];
      return {
        title: `${verb} ${label(payload.entityType)}`,
        description: `${verb} ${label(payload.entityType)} ${payload.id}.`,
      };
    }
    case "run_entity_action":
      return {
        title: `${payload.action} ${label(payload.entityType)}`,
        description: `Run "${payload.action}" on ${label(payload.entityType)} ${payload.id}.`,
      };
  }
};

// ─── Field value validation ───────────────────────────────────────────────────

export const validateFieldValue = (
  validator: FieldValidator,
  value: unknown,
  fieldName?: string,
): void => {
  const label = fieldName ? `Field "${fieldName}"` : 'Value';
  switch (validator.kind) {
    case 'string': {
      if (typeof value !== 'string') throw HttpErrors.badRequest(`${label} must be a string`);
      if (validator.minLength !== undefined && value.length < validator.minLength)
        throw HttpErrors.badRequest(`${label} must be at least ${validator.minLength} character(s)`);
      if (validator.maxLength !== undefined && value.length > validator.maxLength)
        throw HttpErrors.badRequest(`${label} must be at most ${validator.maxLength} characters`);
      break;
    }
    case 'enum': {
      if (typeof value !== 'string' || !validator.values.includes(value))
        throw HttpErrors.badRequest(`${label} must be one of: ${validator.values.join(', ')}`);
      break;
    }
    case 'email': {
      if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        throw HttpErrors.badRequest(`${label} must be a valid email address`);
      break;
    }
    case 'date': {
      if (typeof value !== 'string' || isNaN(Date.parse(value)))
        throw HttpErrors.badRequest(`${label} must be a valid date string`);
      break;
    }
    case 'money': {
      if (typeof value !== 'number' || isNaN(value))
        throw HttpErrors.badRequest(`${label} must be a number`);
      if (validator.min !== undefined && value < validator.min)
        throw HttpErrors.badRequest(`${label} must be >= ${validator.min}`);
      if (validator.max !== undefined && value > validator.max)
        throw HttpErrors.badRequest(`${label} must be <= ${validator.max}`);
      break;
    }
    case 'number': {
      if (typeof value !== 'number' || isNaN(value))
        throw HttpErrors.badRequest(`${label} must be a number`);
      if (validator.integer && !Number.isInteger(value))
        throw HttpErrors.badRequest(`${label} must be an integer`);
      if (validator.min !== undefined && value < validator.min)
        throw HttpErrors.badRequest(`${label} must be >= ${validator.min}`);
      if (validator.max !== undefined && value > validator.max)
        throw HttpErrors.badRequest(`${label} must be <= ${validator.max}`);
      break;
    }
    case 'boolean': {
      if (typeof value !== 'boolean')
        throw HttpErrors.badRequest(`${label} must be a boolean`);
      break;
    }
    case 'array': {
      if (!Array.isArray(value))
        throw HttpErrors.badRequest(`${label} must be an array`);
      if (validator.items) {
        for (let i = 0; i < value.length; i++) {
          validateFieldValue(validator.items, value[i], `${label}[${i}]`);
        }
      }
      break;
    }
    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw HttpErrors.badRequest(`${label} must be an object`);
      if (validator.schema) {
        for (const [k, subValidator] of Object.entries(validator.schema)) {
          const subValue = (value as Record<string, unknown>)[k];
          if (subValue !== undefined) {
            validateFieldValue(subValidator, subValue, `${label}.${k}`);
          }
        }
      }
      break;
    }
  }
};

// ─── Post-write verification ──────────────────────────────────────────────────

/**
 * Confirm that a set of operations took effect by comparing against the
 * read-after-write result. Only verifies set/replace/add_to_set/remove_from_set;
 * increment and append are skipped (indeterminate expected value).
 * Returns a list of failure messages; empty means all checks passed.
 */
export const verifyOperations = (
  operations: Operation[],
  verified: Record<string, unknown>,
  writableFields: WritableField[],
): string[] => {
  const failures: string[] = [];
  for (const op of operations) {
    if (op.op !== 'set' && op.op !== 'replace' && op.op !== 'add_to_set' && op.op !== 'remove_from_set') {
      continue;
    }
    const fieldConfig = writableFields.find(
      (f) => f.field === op.field || f.aliases?.includes(op.field),
    );
    const canonical = fieldConfig?.field ?? op.field;
    const actual = verified[canonical];

    if (op.op === 'set' || op.op === 'replace') {
      if (JSON.stringify(actual) !== JSON.stringify(op.value)) {
        failures.push(
          `Field "${canonical}" expected ${JSON.stringify(op.value)}, got ${JSON.stringify(actual)}`,
        );
      }
    } else if (op.op === 'add_to_set') {
      if (!Array.isArray(actual)) {
        failures.push(`Field "${canonical}" expected array after add_to_set`);
      } else {
        const identityKey = fieldConfig?.setIdentityKey;
        const contains = actual.some((item) =>
          identityKey && item && typeof item === 'object' && typeof op.value === 'object' && op.value !== null
            ? (item as Record<string, unknown>)[identityKey] === (op.value as Record<string, unknown>)[identityKey]
            : item === op.value,
        );
        if (!contains) {
          failures.push(
            `Field "${canonical}" should contain ${JSON.stringify(op.value)} after add_to_set`,
          );
        }
      }
    } else if (op.op === 'remove_from_set') {
      if (Array.isArray(actual)) {
        const identityKey = fieldConfig?.setIdentityKey;
        const stillPresent = actual.some((item) =>
          identityKey && item && typeof item === 'object' && typeof op.value === 'object' && op.value !== null
            ? (item as Record<string, unknown>)[identityKey] === (op.value as Record<string, unknown>)[identityKey]
            : item === op.value,
        );
        if (stillPresent) {
          failures.push(
            `Field "${canonical}" should not contain ${JSON.stringify(op.value)} after remove_from_set`,
          );
        }
      }
    }
  }
  return failures;
};

export type { PracticeAssistantSource };
