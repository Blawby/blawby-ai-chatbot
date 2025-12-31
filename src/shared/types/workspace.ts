export type WorkspaceType = 'public' | 'client' | 'practice';

export type WorkspacePreference = Exclude<WorkspaceType, 'public'>;
