import type { Env } from '../../types.js';
import type { PracticeAssistantTurnMetadata } from './types.js';

const MAX_INSERT_RETRIES = 3;

const isSeqConstraintError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('uq_chat_messages_conv_seq')
    || (message.includes('UNIQUE constraint failed') && message.includes('chat_messages.conversation_id') && message.includes('chat_messages.seq'));
};

export const uniqueBySource = <T extends { type: string; id: string }>(items: T[]): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
};

export const buildTurnMetadata = (
  tools: PracticeAssistantTurnMetadata['tools'],
  progress: PracticeAssistantTurnMetadata['progress'],
): PracticeAssistantTurnMetadata => {
  const sources = uniqueBySource(tools.flatMap((tool) => tool.sources ?? []));
  const assistantActions = tools.map((tool) => tool.action).filter(Boolean) as PracticeAssistantTurnMetadata['assistantActions'];
  const pendingActions = assistantActions.filter((action) => action.status === 'pending');
  const actions: PracticeAssistantTurnMetadata['actions'] = pendingActions.flatMap((action) => [
    {
      type: 'practice_assistant_decision',
      label: 'Reject',
      actionId: action.actionId,
      decision: 'reject',
      variant: 'secondary',
    },
    {
      type: 'practice_assistant_decision',
      label: 'Approve',
      actionId: action.actionId,
      decision: 'approve',
      variant: 'primary',
    },
  ]);
  return { source: 'practice_assistant', tools, progress, sources, assistantActions, actions };
};

export const persistAssistantMessage = async (
  env: Env,
  input: {
    conversationId: string;
    practiceId: string;
    content: string;
    metadata: PracticeAssistantTurnMetadata;
  },
): Promise<string> => {
  const now = new Date().toISOString();
  const messageId = crypto.randomUUID();
  const clientId = `practice-assistant:${messageId}`;
  for (let attempt = 0; attempt < MAX_INSERT_RETRIES; attempt += 1) {
    const seqRow = await env.DB.prepare(`
      SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq
      FROM chat_messages
      WHERE conversation_id = ?
    `).bind(input.conversationId).first<{ next_seq: number }>();
    const seq = Number(seqRow?.next_seq ?? 1);

    try {
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO chat_messages (
            id, conversation_id, practice_id, user_id, role, content, metadata,
            client_id, seq, server_ts, created_at
          ) VALUES (?, ?, ?, NULL, 'assistant', ?, ?, ?, ?, ?, ?)
        `).bind(
          messageId,
          input.conversationId,
          input.practiceId,
          input.content,
          JSON.stringify(input.metadata),
          clientId,
          seq,
          now,
          now,
        ),
        env.DB.prepare(`
          UPDATE conversations
          SET last_message_content = ?, last_message_at = ?, latest_seq = ?, updated_at = ?
          WHERE id = ? AND practice_id = ?
        `).bind(
          input.content.slice(0, 500),
          now,
          seq,
          now,
          input.conversationId,
          input.practiceId,
        ),
      ]);

      return messageId;
    } catch (error) {
      if (!isSeqConstraintError(error) || attempt === MAX_INSERT_RETRIES - 1) {
        throw new Error(
          isSeqConstraintError(error)
            ? 'Failed to persist assistant message after retrying sequence allocation'
            : (error instanceof Error ? error.message : String(error))
        );
      }
    }
  }

  throw new Error('Failed to persist assistant message');
};
