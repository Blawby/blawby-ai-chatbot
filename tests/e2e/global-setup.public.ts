import type { FullConfig } from '@playwright/test';
import { runPublicGlobalSetup } from './globalSetupSupport';

export default async function globalSetup(config: FullConfig) {
  await runPublicGlobalSetup(config);
}
