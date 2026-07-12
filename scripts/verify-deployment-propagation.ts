const [mode, rawUrl, rawAttempts = '10', rawTimeoutSeconds = '10'] = process.argv.slice(2);
if ((mode !== 'worker' && mode !== 'page') || !rawUrl) {
  throw new Error('Usage: verify-deployment-propagation.ts <worker|page> <https-url> [attempts] [timeout-seconds]');
}
const url = new URL(rawUrl);
if (url.protocol !== 'https:') throw new Error('Propagation checks require HTTPS');
const attempts = Number.parseInt(rawAttempts, 10);
const timeoutSeconds = Number.parseInt(rawTimeoutSeconds, 10);
if (!Number.isInteger(attempts) || attempts < 1 || attempts > 20) throw new Error('Attempts must be between 1 and 20');
if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 30) {
  throw new Error('Timeout must be between 1 and 30 seconds');
}

const expectedCommit = process.env.EXPECTED_COMMIT?.trim();
const expectedDeploymentId = process.env.EXPECTED_DEPLOYMENT_ID?.trim();
if (mode === 'worker' && (!expectedCommit || !expectedDeploymentId)) {
  throw new Error('Worker propagation requires EXPECTED_COMMIT and EXPECTED_DEPLOYMENT_ID');
}

let lastFailure = 'No response';
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutSeconds * 1000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (mode === 'worker') {
      const body = await response.json() as {
        data?: { environment?: unknown; release?: { commit?: unknown; workerVersionId?: unknown } };
      };
      if (body.data?.environment !== 'production') throw new Error('Worker environment is not production');
      if (body.data.release?.commit !== expectedCommit) throw new Error('Worker commit has not propagated');
      if (body.data.release?.workerVersionId !== expectedDeploymentId) {
        throw new Error('Worker deployment identifier has not propagated');
      }
    }
    console.log(`Propagation verified for ${url.hostname} on attempt ${attempt}`);
    process.exit(0);
  } catch (error) {
    lastFailure = error instanceof Error ? error.message : 'Unknown propagation failure';
    console.log(`Propagation attempt ${attempt}/${attempts} not ready: ${lastFailure}`);
    if (attempt < attempts) await new Promise((resolveDelay) => setTimeout(resolveDelay, 5000));
  }
}
throw new Error(`Propagation did not complete after ${attempts} attempts: ${lastFailure}`);
