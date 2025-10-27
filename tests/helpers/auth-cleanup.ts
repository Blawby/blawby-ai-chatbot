interface TestUser {
  email: string;
  endpoints?: string[];
}

interface CleanupResult {
  success: boolean;
  partial?: boolean;
  error?: string;
}

export async function cleanupTestUser(email: string): Promise<CleanupResult> {
  return {
    success: true,
    partial: true
  };
}

export async function cleanupTestUsers(users: TestUser[]): Promise<CleanupResult[]> {
  return Promise.all(users.map((user) => cleanupTestUser(user.email)));
}

export function generateTestEmail(prefix: string = 'test'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${prefix}-${timestamp}-${random}@blawby-test.com`;
}

export function isTestEmail(email: string): boolean {
  return email.includes('@blawby-test.com') || (email.includes('test-') && email.includes('@example.com'));
}

export function setupTestCleanup(testUsers: TestUser[] = []) {
  return async () => {
    if (testUsers.length > 0) {
      await cleanupTestUsers(testUsers);
    }
  };
}

export function addUserToCleanup(users: TestUser[], email: string, endpoints: string[] = []): void {
  users.push({ email, endpoints });
}

export function logCleanupSummary(users: TestUser[]): void {
  if (users.length === 0) {
    return;
  }

  const summaryLines = users.map((user) => {
    const endpointNote = user.endpoints && user.endpoints.length > 0
      ? `    endpoints exercised: ${user.endpoints.join(', ')}`
      : '    endpoints exercised: (not recorded)';
    return [`  • ${user.email}`, endpointNote].join('\n');
  });

  const summary = [
    'Auth E2E created the following test accounts (no automated deletion available yet):',
    ...summaryLines
  ].join('\n');

  console.log(`\n${summary}\n`);
}
