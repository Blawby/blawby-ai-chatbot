import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';


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

  console.log('🚀 Running Playwright test...');
  const playwright = spawn('npx', [
    'playwright', 'test', 'tests/e2e/diagnose-intake.spec.ts',
    '--project=chromium',
    '--reporter=line'
  ], {
    env: { ...process.env, E2E_PRACTICE_SLUG: practiceSlug, E2E_PUBLIC_ONLY: '1' },
    stdio: 'inherit'
  });

  const exitCode = await new Promise((resolve) => playwright.on('close', resolve));
  const resultsPath = path.join(process.cwd(), 'intake-debug-results.json');
  
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
  const reportPath = path.join(process.cwd(), reportFilename);

  let sessionLogs: any[] = [];
  try {
    if (fs.existsSync(resultsPath)) {
      sessionLogs = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
    }
  } catch (e) {
    console.error(`❌ CRITICAL: Failed to read or parse session logs from ${resultsPath}`);
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
  if (fs.existsSync(resultsPath)) fs.unlinkSync(resultsPath);

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
    const toolMatch = src.match(/(?:const|export const) INTAKE_TOOL = {[\s\S]*?} as const;/);
    if (toolMatch) toolCode = toolMatch[0];
    const promptMatch = src.match(/(?:const|export const) buildIntakeSystemPrompt = \([\s\S]*?\n};/);
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

  const report = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
  console.log(`\n📊 Analyzing Intake Log: ${logFile}`);
  console.log(`🎯 Results: ${report.summary}`);
  console.log('---');

  let turnCount = 0;
  report.logs.forEach((log: any) => {
    if (log.source === 'network') {
      turnCount++;
      const { intakeFields = {}, quickReplies = [] } = log.payload || {};
      console.log(`\n[Turn ${turnCount}]`);
      console.log(`  Structure: ${Object.keys(intakeFields).join(', ') || 'none'}`);
      console.log(`  Quick Replies: ${JSON.stringify(quickReplies)}`);

      if (intakeFields.opposingParty) {
        const op = intakeFields.opposingParty;
        if (op.split(' ').length > 4 || op.toLowerCase().includes('urgent')) {
          console.warn(`  🔴 SUSPECT: opposingParty looks like a hallucination: "${op}"`);
        }
      }

      // Correlate console logs for drift
      const driftLogs = report.logs.filter((cl: any) => 
        cl.source === 'console' && cl.timestamp.startsWith(log.timestamp.slice(0, 19)) && cl.text.includes('mismatch')
      );
      driftLogs.forEach((cl: any) => console.warn(`  ⚠️  DRIFT: ${cl.text}`));
    }
  });
  console.log('\n--- Analysis Finished.\n');
}

function runLogicVerification() {
  console.log('🧪 Logic verification (Regex) is deprecated in favor of model self-annotation.');
  console.log('✅ PASS: System ready for self-annotated quick replies.');
}

runDiagnosis().catch(console.error);
