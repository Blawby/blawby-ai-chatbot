import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (relativePath: string): string =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('engagement draft ownership', () => {
  it('keeps generation backend-owned and removes partial-letter fallbacks', () => {
    const routes = read('worker/index.ts');
    const viteConfig = read('vite.config.ts');
    const workbench = read('src/features/engagements/components/EngagementWorkbench.tsx');
    const intakeDetail = read('src/features/intake/pages/IntakeDetailPage.tsx');

    expect(routes).not.toContain('/api/ai/generate-engagement');
    expect(viteConfig).toContain("'engagement-templates'");
    expect(fs.existsSync(path.resolve(process.cwd(), 'worker/routes/generateEngagement.ts'))).toBe(false);
    expect(workbench).toContain('engagementTemplatesApi.generateDraft');
    expect(intakeDetail).toContain('engagementTemplatesApi.generateDraft');
    expect(workbench).not.toContain('contractBody: prev.contractBody || buildDeterministicContractBody');
  });
});
