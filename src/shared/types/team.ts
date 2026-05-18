export type TeamRole = 'owner' | 'admin' | 'attorney' | 'paralegal' | 'member';

export const TEAM_ROLE_VALUES = ['owner', 'admin', 'attorney', 'paralegal', 'member'] as const satisfies TeamRole[];
export const TEAM_ASSIGNABLE_ROLE_VALUES = ['owner', 'admin', 'attorney', 'paralegal'] as const satisfies TeamRole[];

const TEAM_ROLE_SET = new Set<TeamRole>(TEAM_ROLE_VALUES);
const TEAM_ASSIGNABLE_ROLE_SET = new Set<TeamRole>(TEAM_ASSIGNABLE_ROLE_VALUES);

export interface TeamMember {
  userId: string;
  email: string;
  name?: string;
  image?: string | null;
  role: TeamRole;
  createdAt: number | null;
  canAssignToMatter: boolean;
  canMentionInternally: boolean;
}

export interface TeamSummary {
  seatsIncluded: number;
  seatsUsed: number;
}

export interface PracticeTeamResponse {
  members: TeamMember[];
  summary: TeamSummary;
}

export const isTeamRole = (value: unknown): value is TeamRole => (
  typeof value === 'string' && TEAM_ROLE_SET.has(value as TeamRole)
);

export const canAssignTeamMemberToMatter = (role: TeamRole): boolean => (
  TEAM_ASSIGNABLE_ROLE_SET.has(role)
);
