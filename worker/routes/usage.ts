import { getOrganizationContext, withOrganizationContext } from "../middleware/organizationContext.js";
import type { Env } from "../types.js";
import { UsageService } from "../services/UsageService.js";
import { HttpErrors, createSuccessResponse } from "../errorHandler.js";

async function resolveOrganizationId(env: Env, organizationIdentifier: string): Promise<string> {
  const trimmed = organizationIdentifier.trim();
  if (!trimmed) {
    throw HttpErrors.badRequest("Organization identifier is required");
  }

  const byId = await env.DB.prepare(
    `SELECT id FROM organizations WHERE id = ? LIMIT 1`
  ).bind(trimmed).first<{ id: string }>();
  if (byId?.id) {
    return byId.id;
  }

  const bySlug = await env.DB.prepare(
    `SELECT id FROM organizations WHERE slug = ? LIMIT 1`
  ).bind(trimmed).first<{ id: string }>();

  if (bySlug?.id) {
    return bySlug.id;
  }

  throw HttpErrors.notFound("Organization not found");
}

export async function handleUsage(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);

  if (segments.length === 3 && segments[0] === "api" && segments[1] === "usage" && segments[2] === "quota") {
    if (request.method !== "GET") {
      throw HttpErrors.methodNotAllowed("Unsupported method for quota endpoint");
    }

    const requestWithContext = await withOrganizationContext(request, env, {
      requireOrganization: true,
      allowUrlOverride: true,
    });

    const orgContext = getOrganizationContext(requestWithContext);
    if (!orgContext.organizationId) {
      throw HttpErrors.badRequest("Organization context required");
    }

    const organizationId = await resolveOrganizationId(env, orgContext.organizationId);
    const quota = await UsageService.getRemainingQuota(env, organizationId);
    return createSuccessResponse(quota);
  }

  throw HttpErrors.notFound("Usage route not found");
}
