import type { ComboboxOption } from '@/shared/ui/input';
import { UserCard, StackedAvatars } from '@/shared/ui/profile';

export type InspectorIdentity = {
  userId: string;
  name: string;
  email?: string;
  image?: string | null;
  role: string;
};

/**
 * Look up an attorney's display label by id. Falls back to a truncated user id
 * (`User abc123`) when no label is known. Used by both MatterInspector and
 * ConversationInspector for assignee/responsible-attorney rendering.
 */
export const resolveAttorneyLabel = (
  id: string | null,
  matterAssigneeOptions: ComboboxOption[],
): string => {
  if (!id) return 'Not set';
  const option = matterAssigneeOptions.find((entry) => entry.value === id);
  return option?.label ?? `User ${id.slice(0, 6)}`;
};

/**
 * Resolve an attorney id to a full identity object, looking through
 * conversation members first, then matter assignee options, then synthesizing
 * a fallback from the id alone. Returns null when id is null.
 */
export const resolveAttorneyIdentity = (
  id: string | null,
  conversationMembers: InspectorIdentity[],
  matterAssigneeOptions: ComboboxOption[],
): InspectorIdentity | null => {
  if (!id) return null;
  const member = conversationMembers.find((entry) => entry.userId === id);
  if (member) return member;
  const option = matterAssigneeOptions.find((entry) => entry.value === id);
  if (option?.label) {
    return {
      userId: id,
      name: option.label,
      email: option.meta,
      image: null,
      role: 'member',
    };
  }
  return {
    userId: id,
    name: `User ${id.slice(0, 6)}`,
    image: null,
    role: 'member',
  };
};

/**
 * Render a small inline identity (avatar + name) for use in inspector summary
 * rows. Returns null when identity is null so callers can fall back to text.
 */
export const renderCompactIdentity = (
  identity: Pick<InspectorIdentity, 'name' | 'image'> | null,
) => {
  if (!identity) return null;
  return (
    <UserCard
      name={identity.name}
      image={identity.image ?? null}
      size="sm"
      className="px-0 py-0"
    />
  );
};

/**
 * Render a stacked-avatar row with a "{count} {label}" caption. Used for team
 * lists (matter assignees, conversation participants).
 */
export const renderIdentityStack = (
  users: Array<{ id: string; name: string; image?: string | null }>,
  emptyLabel: string,
  singularLabel: string,
  pluralLabel: string,
) => {
  if (users.length === 0) {
    return <span className="text-dim">{emptyLabel}</span>;
  }

  return (
    <div className="flex items-center gap-3">
      <StackedAvatars users={users} size="sm" max={4} className="shrink-0" />
      <div className="min-w-0">
        <p className="truncate text-[14px] text-ink">
          {users.map((user) => user.name).join(', ')}
        </p>
        <p className="text-[11px] uppercase tracking-wider text-dim">
          {users.length} {users.length === 1 ? singularLabel : pluralLabel}
        </p>
      </div>
    </div>
  );
};
