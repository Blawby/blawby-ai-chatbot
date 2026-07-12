import { parsePagesCanonicalDeployment } from "./lib/deploymentEvidence.js";

const [
  pagesProject,
  expectedDeploymentId,
  rawAttempts = "10",
  rawTimeoutSeconds = "10",
] = process.argv.slice(2);
if (!pagesProject || !expectedDeploymentId) {
  throw new Error(
    "Usage: verify-pages-canonical.ts <pages-project> <deployment-id> [attempts] [timeout-seconds]",
  );
}
if (!/^[a-z0-9-]+$/i.test(pagesProject))
  throw new Error("Pages project name is invalid");
if (/\s/.test(expectedDeploymentId))
  throw new Error("Pages deployment identifier is invalid");
const attempts = Number.parseInt(rawAttempts, 10);
const timeoutSeconds = Number.parseInt(rawTimeoutSeconds, 10);
if (!Number.isInteger(attempts) || attempts < 1 || attempts > 20) {
  throw new Error("Attempts must be between 1 and 20");
}
if (
  !Number.isInteger(timeoutSeconds) ||
  timeoutSeconds < 1 ||
  timeoutSeconds > 30
) {
  throw new Error("Timeout must be between 1 and 30 seconds");
}

const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
if (!token || !accountId)
  throw new Error("Cloudflare deployment credentials are required");

let lastFailure = "No response";
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(pagesProject)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(timeoutSeconds * 1000),
      },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const canonical = parsePagesCanonicalDeployment(await response.json());
    if (canonical.deploymentId !== expectedDeploymentId) {
      throw new Error("Pages canonical deployment has not propagated");
    }
    console.log(`Canonical Pages deployment verified on attempt ${attempt}`);
    process.exit(0);
  } catch (error) {
    lastFailure =
      error instanceof Error
        ? error.message
        : "Unknown Pages verification failure";
    console.log(
      `Pages verification attempt ${attempt}/${attempts} not ready: ${lastFailure}`,
    );
    if (attempt < attempts) {
      await new Promise((resolveDelay) =>
        globalThis.setTimeout(resolveDelay, 5000),
      );
    }
  }
}
throw new Error(
  `Pages canonical deployment did not propagate after ${attempts} attempts: ${lastFailure}`,
);
