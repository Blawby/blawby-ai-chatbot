import { HttpErrors } from '../errorHandler.js';
import type { Env } from '../types.js';
import { RemoteApiService } from './RemoteApiService.js';
import { isTeamRole } from '../../src/shared/types/team.js';

export type ParticipantRecord = {
  userId: string;
  name: string | null;
  image: string | null;
  role: string | null;
  isTeamMember: boolean;
  canBeMentionedByTeamMember: boolean;
  canBeMentionedByClient: boolean;
};

type ConversationRecord = {
  user_id: string | null;
  is_anonymous?: boolean;
  participants: string[];
  user_info: Record<string, unknown> | null;
};

export type MentionSenderType = 'team_member' | 'client' | 'anonymous';

const normalizeParticipantIds = (conversation: ConversationRecord): string[] => {
  const ids = new Set<string>();
  if (typeof conversation.user_id === 'string' && conversation.user_id.trim().length > 0) {
    ids.add(conversation.user_id.trim());
  }
  for (const userId of conversation.participants) {
    if (typeof userId === 'string' && userId.trim().length > 0) {
      ids.add(userId.trim());
    }
  }
  return [...ids];
};

const extractConversationClientName = (userInfo: Record<string, unknown> | null): string | null => {
  if (!userInfo) return null;

  const directName = typeof userInfo.name === 'string' ? userInfo.name.trim() : '';
  if (directName) return directName;

  const directEmail = typeof userInfo.email === 'string' ? userInfo.email.trim() : '';
  if (directEmail) return directEmail;

  const intakeSlimContactDraft = userInfo.intakeSlimContactDraft;
  if (intakeSlimContactDraft && typeof intakeSlimContactDraft === 'object') {
    const draft = intakeSlimContactDraft as Record<string, unknown>;
    const name = typeof draft.name === 'string' ? draft.name.trim() : '';
    if (name) return name;
    const email = typeof draft.email === 'string' ? draft.email.trim() : '';
    if (email) return email;
  }

  const consultation = userInfo.consultation;
  if (consultation && typeof consultation === 'object') {
    const consultationRecord = consultation as Record<string, unknown>;
    const contact = consultationRecord.contact;
    if (contact && typeof contact === 'object') {
      const contactRecord = contact as Record<string, unknown>;
      const name = typeof contactRecord.name === 'string' ? contactRecord.name.trim() : '';
      if (name) return name;
      const email = typeof contactRecord.email === 'string' ? contactRecord.email.trim() : '';
      if (email) return email;
    }
  }

  return null;
};

export async function listConversationParticipantRecords(options: {
  env: Env;
  practiceId: string;
  conversation: ConversationRecord;
  request?: Request;
}): Promise<ParticipantRecord[]> {
  const { env, practiceId, conversation, request } = options;
  const practiceMembers = await RemoteApiService.getPracticeMembers(env, practiceId, request);
  const participantIds = normalizeParticipantIds(conversation);
  const teamMembersById = new Map(
    practiceMembers
      .filter((member) => typeof member.user_id === 'string' && member.user_id.trim().length > 0)
      .map((member) => [member.user_id.trim(), member] as const)
  );

  const orderedIds = Array.from(new Set([
    ...participantIds,
    ...practiceMembers
      .filter((member) => isTeamRole(member.role))
      .map((member) => (typeof member.user_id === 'string' ? member.user_id.trim() : ''))
      .filter((userId) => userId.length > 0),
  ]));

  const conversationClientName = extractConversationClientName(conversation.user_info);

  return orderedIds.map((userId) => {
    const member = teamMembersById.get(userId);
    const isTeamMember = isTeamRole(member?.role);
    const isAnonymousConversationOwner = conversation.is_anonymous === true && conversation.user_id === userId;
    const isClientParticipant = participantIds.includes(userId) && !isTeamMember && !isAnonymousConversationOwner;

    const name = member?.name?.trim()
      ? member.name.trim()
      : (userId === conversation.user_id ? conversationClientName : null);

    return {
      userId,
      name: name && name.length > 0 ? name : null,
      image: typeof member?.image === 'string' ? member.image : null,
      role: typeof member?.role === 'string' ? member.role : null,
      isTeamMember,
      canBeMentionedByTeamMember: isTeamMember || isClientParticipant,
      canBeMentionedByClient: isTeamMember || (isClientParticipant && userId !== conversation.user_id),
    };
  });
}

export function validateMentionTargets(options: {
  participants: ParticipantRecord[];
  senderType: MentionSenderType;
  mentionedUserIds: string[];
}): string[] {
  const rawMentionUserIds = Array.from(new Set(
    options.mentionedUserIds
      .map((userId) => userId.trim())
      .filter((userId) => userId.length > 0)
  ));

  if (rawMentionUserIds.length === 0) {
    return [];
  }

  if (options.senderType === 'anonymous') {
    throw HttpErrors.badRequest('Anonymous users cannot mention anyone');
  }

  const participantById = new Map(options.participants.map((participant) => [participant.userId, participant] as const));

  for (const userId of rawMentionUserIds) {
    const participant = participantById.get(userId);
    if (!participant) {
      throw HttpErrors.badRequest(`Unknown mention target: ${userId}`);
    }

    const isAllowed = options.senderType === 'team_member'
      ? participant.canBeMentionedByTeamMember === true
      : participant.canBeMentionedByClient === true;

    if (!isAllowed) {
      throw HttpErrors.badRequest(`Mention target is not allowed: ${userId}`);
    }
  }

  return rawMentionUserIds;
}

export function extractMentionUserIds(metadata: Record<string, unknown> | null | undefined): string[] {
  if (!metadata) return [];

  const rawValues = [
    metadata.mentionedUserIds,
    metadata.mentionUserIds,
    metadata.mentions,
    metadata.mentioned_user_ids,
  ];

  const mentionUserIds: string[] = [];
  for (const rawValue of rawValues) {
    if (!Array.isArray(rawValue)) continue;
    for (const value of rawValue) {
      if (typeof value === 'string') {
        mentionUserIds.push(value);
      }
    }
  }

  return mentionUserIds;
}

export function withValidatedMentionMetadata(
  metadata: Record<string, unknown> | null,
  mentionedUserIds: string[],
): Record<string, unknown> | null {
  if (!metadata) {
    return mentionedUserIds.length > 0
      ? {
        mentionedUserIds,
        mentionUserIds: mentionedUserIds,
        mentions: mentionedUserIds,
      }
      : null;
  }

  const nextMetadata = { ...metadata };
  if (mentionedUserIds.length === 0) {
    delete nextMetadata.mentionedUserIds;
    delete nextMetadata.mentionUserIds;
    delete nextMetadata.mentions;
    delete nextMetadata.mentioned_user_ids;
    return nextMetadata;
  }

  nextMetadata.mentionedUserIds = mentionedUserIds;
  nextMetadata.mentionUserIds = mentionedUserIds;
  nextMetadata.mentions = mentionedUserIds;
  delete nextMetadata.mentioned_user_ids;
  return nextMetadata;
}
