import { appendFileSync } from "node:fs";
import {
  parsePagesCanonicalDeployment,
  parseWorkerHealthRelease,
} from "./lib/deploymentEvidence.js";

const [rawHealthUrl, pagesProject, rawEnvironment] = process.argv.slice(2);
if (
  !rawHealthUrl ||
  !pagesProject ||
  (rawEnvironment !== "production" && rawEnvironment !== "staging")
) {
  throw new Error(
    "Usage: capture-cloudflare-release.ts <health-url> <pages-project> <production|staging>",
  );
}
const healthUrl = new URL(rawHealthUrl);
if (healthUrl.protocol !== "https:")
  throw new Error("Worker health URL must use HTTPS");
if (!/^[a-z0-9-]+$/i.test(pagesProject))
  throw new Error("Pages project name is invalid");

const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
if (!token || !accountId)
  throw new Error("Cloudflare deployment credentials are required");

const workerResponse = await fetch(healthUrl, {
  cache: "no-store",
  headers: {
    accept: "application/json",
    "user-agent":
      "Mozilla/5.0 (compatible; BlawbyDeploymentVerifier/1.0; +https://github.com/Blawby/blawby-ai-chatbot)",
  },
  signal: AbortSignal.timeout(10_000),
});
if (!workerResponse.ok)
  throw new Error(
    `Worker health request failed with HTTP ${workerResponse.status}`,
  );
const worker = parseWorkerHealthRelease(
  await workerResponse.json(),
  rawEnvironment,
);

const pagesResponse = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(pagesProject)}`,
  {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  },
);
if (!pagesResponse.ok)
  throw new Error(
    `Cloudflare Pages project request failed with HTTP ${pagesResponse.status}`,
  );
const pages = parsePagesCanonicalDeployment(await pagesResponse.json());

const output =
  [
    `previous_worker_commit=${worker.commit}`,
    `previous_worker_deployment_id=${worker.deploymentId}`,
    `previous_pages_deployment_id=${pages.deploymentId}`,
    `previous_pages_deployment_url=${pages.deploymentUrl}`,
  ].join("\n") + "\n";
const githubOutput = process.env.GITHUB_OUTPUT?.trim();
if (githubOutput) appendFileSync(githubOutput, output, "utf8");
else process.stdout.write(output);
