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
  actions?: string[];
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
      'Sync matters and cases',
      'Sync contacts and clients',
      'Sync calendar events',
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
