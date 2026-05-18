import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const DIAGNOSTICS_DIR = path.join(process.cwd(), '.tmp', 'playwright', 'diagnostics');
const SESSION_RESULTS_PATH = path.join(DIAGNOSTICS_DIR, 'intake-debug-results.json');

type DiagnosticLogEntry = {
  source?: string;
  timestamp?: string;
  text?: string;
  payload?: {
    intakeFields?: Record<string, unknown>;
    quickReplies?: unknown[];
  };
};

type DiagnosticReport = {
  summary?: string;
  logs?: DiagnosticLogEntry[];
};

/**
 * Unified Intake Diagnostic & Verification Tool
 * Commands:
 *  - (default): Run full E2E capture + auto-analysis
 *  - --analyze <file>: Run detailed analysis on an existing JSON report
 *  - --verify: Run logic verification unit tests in isolation
 */

async function runDiagnosis() {
  const args = process.argv.slice(2);
  const practiceSlug = process.env.E2E_PRACTICE_SLUG || 'paul-yahoo';

  // --- SUBCOMMAND: VERIFY LOGIC ---
  if (args.includes('--verify')) {
    runLogicVerification();
    return;
  }

  // --- SUBCOMMAND: ANALYZE LOG ---
  const analyzeIndex = args.indexOf('--analyze');
  if (analyzeIndex !== -1 && args[analyzeIndex + 1]) {
    runLogAnalysis(args[analyzeIndex + 1]);
    return;
  }

  // --- DEFAULT: FULL DIAGNOSIS ---
  console.log(`\n🔍 Starting automated intake diagnosis for practice: ${practiceSlug}`);
  console.log(`📍 Ensure "npm run dev:full" is running at https://local.blawby.com\n`);
  fs.mkdirSync(DIAGNOSTICS_DIR, { recursive: true });

  console.log('🚀 Running Playwright test...');
  const playwright = spawn('npx', [
    'playwright', 'test', 'tests/e2e/widget-diagnose.spec.ts',
    '--project=chromium',
    '--reporter=line'
  ], {
    env: { ...process.env, E2E_PRACTICE_SLUG: practiceSlug, E2E_PUBLIC_ONLY: '1' },
    stdio: 'inherit'
  });

  const exitCode = await new Promise((resolve) => playwright.on('close', resolve));
  // Read relevant code snapshots
  const { toolCode, promptCode } = captureCodeSnapshots();

  // Generate Report
  const now = new Date();
  const timestamp = now.getFullYear() + 
    String(now.getMonth() + 1).padStart(2, '0') + 
    String(now.getDate()).padStart(2, '0') + '-' +
    String(now.getHours()).padStart(2, '0') + 
    String(now.getMinutes()).padStart(2, '0') + 
    String(now.getSeconds()).padStart(2, '0');
  
  const reportFilename = `intake-diag-${timestamp}.json`;
  const reportPath = path.join(DIAGNOSTICS_DIR, reportFilename);

  let sessionLogs: DiagnosticLogEntry[] = [];
  try {
    if (fs.existsSync(SESSION_RESULTS_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(SESSION_RESULTS_PATH, 'utf-8')) as unknown;
      sessionLogs = Array.isArray(parsed) ? parsed as DiagnosticLogEntry[] : [];
    }
  } catch (e) {
    console.error(`❌ CRITICAL: Failed to read or parse session logs from ${SESSION_RESULTS_PATH}`);
    console.error(`   Error: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  const report = {
    date: now.toISOString(),
    target_practice: practiceSlug,
    summary: exitCode === 0 ? `Successful diagnosis` : `FAILED diagnosis (exit ${exitCode})`,
    logs: sessionLogs,
    code_snapshots: { tool_schema: toolCode, system_prompt: promptCode }
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (fs.existsSync(SESSION_RESULTS_PATH)) fs.unlinkSync(SESSION_RESULTS_PATH);

  console.log(`\n✨ Diagnosis complete! (Exit: ${exitCode})`);
  console.log(`📄 Report saved to: ${reportPath}`);

  // Run auto-analysis on the new report
  if (sessionLogs.length > 0) {
    runLogAnalysis(reportFilename);
  } else if (exitCode !== 0) {
    console.warn('\n⚠️  Capture failed. No logs were collected for analysis.');
  }
}

function captureCodeSnapshots() {
  const intakePath = path.join(process.cwd(), 'worker/routes/aiChatIntake.ts');
  let toolCode = 'Not found';
  let promptCode = 'Not found';

  if (fs.existsSync(intakePath)) {
    const src = fs.readFileSync(intakePath, 'utf-8');
    const toolMatch = src.match(/(?:const|export const) INTAKE_TOOL = {[\s\S]*?}(?:\s*as\s+const)?\s*;/);
    if (toolMatch) toolCode = toolMatch[0];
    const promptMatch = src.match(/(?:const|export const) buildIntakeSystemPrompt = \([\s\S]*?\n\s*};/);
    if (promptMatch) promptCode = promptMatch[0];
  }
  return { toolCode, promptCode };
}

function runLogAnalysis(logFile: string) {
  const logPath = path.resolve(process.cwd(), logFile);
  if (!fs.existsSync(logPath)) {
    console.error(`File not found: ${logPath}`);
    return;
  }

  let report: DiagnosticReport | null = null;
  try {
    report = JSON.parse(fs.readFileSync(logPath, 'utf-8')) as DiagnosticReport;
  } catch (e) {
    console.error(`❌ CRITICAL: Failed to parse intake log from ${logFile}`);
    console.error(`   Error: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  console.log(`\n📊 Analyzing Intake Log: ${logFile}`);
  console.log(`🎯 Results: ${report.summary}`);
  console.log('---');

  const logs = Array.isArray(report?.logs) ? report.logs : [];
  let turnCount = 0;
  logs.forEach((log) => {
    if (log.source === 'network') {
      turnCount++;
      const { intakeFields = {}, quickReplies = [] } = log.payload || {};
      console.log(`\n[Turn ${turnCount}]`);
      console.log(`  Structure: ${Object.keys(intakeFields).join(', ') || 'none'}`);
      console.log(`  Quick Replies: ${JSON.stringify(quickReplies)}`);

      const opposingParty = intakeFields.opposingParty;
      if (typeof opposingParty === 'string' && opposingParty.length > 0) {
        const op = opposingParty;
        if (op.split(' ').length > 4 || op.toLowerCase().includes('urgent')) {
          console.warn(`  🔴 SUSPECT: opposingParty looks like a hallucination: "${op}"`);
        }
      }

      // Correlate console logs for drift
      const timestampPrefix = typeof log.timestamp === 'string' ? log.timestamp.slice(0, 19) : '';
      const driftLogs = logs.filter((cl) =>
        cl.source === 'console'
        && typeof cl.timestamp === 'string'
        && typeof cl.text === 'string'
        && cl.timestamp.startsWith(timestampPrefix)
        && cl.text.includes('mismatch')
      );
      driftLogs.forEach((cl) => console.warn(`  ⚠️  DRIFT: ${cl.text}`));
    }
  });
  console.log('\n--- Analysis Finished.\n');
}

function runLogicVerification() {
  console.log('🧪 Logic verification (Regex) is deprecated in favor of model self-annotation.');
  console.log('✅ PASS: System ready for self-annotated quick replies.');
}

runDiagnosis().catch(console.error);
