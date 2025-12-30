export interface AppAction {
  name: string;
  description: string;
  hasMetadata?: boolean;
  visibility?: 'public' | 'private';
}

export interface App {
  id: string;
  name: string;
  description: string;
  category: string;
  developer: string;
  website: string;
  privacyPolicy: string;
  connected: boolean;
  connectedAt?: string;
  logo?: string;
  actions?: AppAction[];
}

export const mockApps: App[] = [
  {
    id: 'clio',
    name: 'Clio',
    description: 'Connect your Clio account to sync matters, contacts, and calendar events.',
    category: 'Legal Practice Management',
    developer: 'Clio',
    website: 'https://www.clio.com',
    privacyPolicy: 'https://www.clio.com/privacy',
    connected: false,
    actions: [
      {
        name: 'GET /api/v4/matters',
        description: 'Retrieve a list of matters (cases) from your Clio account.',
        hasMetadata: true,
        visibility: 'public'
      },
      {
        name: 'GET /api/v4/contacts',
        description: 'Retrieve a list of contacts (clients, opposing counsel, etc.) from your Clio account.',
        hasMetadata: true,
        visibility: 'public'
      },
      {
        name: 'GET /api/v4/activities',
        description: 'Retrieve a list of activities (time entries, events, tasks) from your Clio account.',
        hasMetadata: true,
        visibility: 'public'
      },
      {
        name: 'GET /api/v4/documents',
        description: 'Retrieve a list of documents from your Clio account.',
        hasMetadata: true,
        visibility: 'public'
      },
      {
        name: 'POST /api/v4/matters',
        description: 'Create a new matter in your Clio account.',
        hasMetadata: true,
        visibility: 'public'
      },
      {
        name: 'POST /api/v4/contacts',
        description: 'Create a new contact in your Clio account.',
        hasMetadata: true,
        visibility: 'public'
      },
      {
        name: 'POST /api/v4/activities',
        description: 'Create a new activity (time entry, event, or task) in your Clio account.',
        hasMetadata: true,
        visibility: 'public'
      },
      {
        name: 'GET /api/v4/billings',
        description: 'Retrieve billing information and invoices from your Clio account.',
        hasMetadata: true,
        visibility: 'public'
      }
    ],
  },
];

// Mock functions that will be replaced with real API calls later
export const mockConnectApp = async (_appId: string) => {
  return new Promise<{ connectedAt: string }>((resolve) => {
    setTimeout(() => {
      resolve({ connectedAt: new Date().toISOString() });
    }, 800);
  });
};

export const mockDisconnectApp = async (_appId: string) => {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), 500);
  });
};
