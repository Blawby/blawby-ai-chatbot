const [pagesProject, deploymentId] = process.argv.slice(2);
if (!pagesProject || !deploymentId) {
  throw new Error(
    "Usage: rollback-pages-deployment.ts <pages-project> <deployment-id>",
  );
}
if (!/^[a-z0-9-]+$/i.test(pagesProject))
  throw new Error("Pages project name is invalid");
if (/\s/.test(deploymentId))
  throw new Error("Pages deployment identifier is invalid");

const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
if (!token || !accountId)
  throw new Error("Cloudflare deployment credentials are required");

const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(pagesProject)}/deployments/${encodeURIComponent(deploymentId)}/rollback`,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  },
);
if (!response.ok)
  throw new Error(
    `Cloudflare Pages rollback failed with HTTP ${response.status}`,
  );
const payload = (await response.json()) as { success?: unknown };
if (payload.success !== true)
  throw new Error("Cloudflare Pages rollback was not successful");
console.log(`Pages rollback accepted for ${pagesProject}`);
