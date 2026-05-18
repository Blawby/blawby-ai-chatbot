import type { FullConfig } from '@playwright/test';
import { runAuthGlobalSetup } from './globalSetupSupport';

export default async function globalSetup(config: FullConfig) {
  await runAuthGlobalSetup(config);
}
