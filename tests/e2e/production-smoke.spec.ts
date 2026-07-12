import { AUTH_STATE_PATHS } from "./helpers/authState";
import { loadE2EConfig } from "./helpers/e2eConfig";
import { expect, test, type Page } from "@playwright/test";

type JsonRecord = Record<string, unknown>;

const config = loadE2EConfig();
const requireRecord = (value: unknown, label: string): JsonRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} is not an object`);
  return value as JsonRecord;
};
const unwrap = (value: unknown): unknown => {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as JsonRecord)
      : null;
  return record && "data" in record ? unwrap(record.data) : value;
};
const records = (value: unknown): JsonRecord[] => {
  const unwrapped = unwrap(value);
  if (Array.isArray(unwrapped))
    return unwrapped.filter((item): item is JsonRecord =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
    );
  const record =
    unwrapped && typeof unwrapped === "object" && !Array.isArray(unwrapped)
      ? (unwrapped as JsonRecord)
      : null;
  if (!record) return [];
  for (const key of ["data", "items", "clients", "conversations", "invoices"]) {
    if (Array.isArray(record[key])) return records(record[key]);
  }
  return [];
};
const text = (record: JsonRecord, ...keys: string[]): string | null => {
  for (const key of keys)
    if (typeof record[key] === "string" && record[key])
      return record[key] as string;
  return null;
};

const installBrowserGuards = (
  page: Page,
  errors: string[],
  forbiddenRequests: string[],
  failedRequiredRequests: string[],
) => {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = request.url();
    if (
      /localhost|127\.0\.0\.1|staging/i.test(url) ||
      (page.url().startsWith("https:") && url.startsWith("http:"))
    ) {
      forbiddenRequests.push(url);
    }
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    const requiredResource =
      ["document", "script", "stylesheet"].includes(request.resourceType()) ||
      url.pathname.startsWith("/api/");
    if (requiredResource && url.origin === new URL(page.url()).origin) {
      failedRequiredRequests.push(`${request.method()} ${url.pathname}`);
    }
  });
  page.on("response", (response) => {
    const request = response.request();
    const url = new URL(response.url());
    const requiredAsset = ["document", "script", "stylesheet"].includes(
      request.resourceType(),
    );
    const failedApi =
      url.pathname.startsWith("/api/") && response.status() >= 500;
    if (
      (failedApi || (requiredAsset && response.status() >= 400)) &&
      url.origin === new URL(page.url()).origin &&
      response.status() >= 400
    ) {
      failedRequiredRequests.push(
        `${response.status()} ${request.method()} ${url.pathname}`,
      );
    }
  });
};

const expectShellBasics = async (page: Page) => {
  await expect(page.locator("body")).toBeVisible();
  const main = page.locator('main, [role="main"]');
  expect(await main.count()).toBeGreaterThan(0);
  await expect(main.first()).toBeVisible();
  expect(
    await page.evaluate(() => ({
      fitsViewport:
        document.documentElement.scrollWidth <= window.innerWidth + 2,
      language: document.documentElement.lang,
      duplicateIds: Array.from(document.querySelectorAll("[id]"))
        .map((element) => element.id)
        .filter((id, index, ids) => id && ids.indexOf(id) !== index),
      unnamedControls: Array.from(
        document.querySelectorAll("button, a[href], input, select, textarea"),
      ).filter((element) => {
        const text = element.textContent?.trim();
        return (
          !text &&
          !element.getAttribute("aria-label") &&
          !element.getAttribute("aria-labelledby") &&
          !(element instanceof HTMLInputElement && element.type === "hidden") &&
          !(element instanceof HTMLInputElement && element.labels?.length)
        );
      }).length,
    })),
  ).toEqual({
    fitsViewport: true,
    language: expect.stringMatching(/^[a-z]{2}/i),
    duplicateIds: [],
    unnamedControls: 0,
  });
};

test.describe("bounded production launch smoke", () => {
  test("verifies production safely and archives its single harmless AI conversation", async ({
    browser,
    baseURL,
  }) => {
    expect(process.env.E2E_REQUIRE_ENV_ONLY).toBe("true");
    const launchMarker = process.env.E2E_LAUNCH_TEST_MARKER;
    expect(launchMarker).toBe("production-launch-test");
    expect(baseURL).toBe("https://ai.blawby.com");
    if (!config)
      throw new Error(
        "Dedicated production launch-test credentials are required",
      );
    expect(config.practice.slug.toLowerCase()).toContain(launchMarker);

    const errors: string[] = [];
    const forbiddenRequests: string[] = [];
    const failedRequiredRequests: string[] = [];
    const owner = await browser.newContext({
      baseURL,
      storageState: AUTH_STATE_PATHS.owner,
    });
    const client = await browser.newContext({
      baseURL,
      storageState: AUTH_STATE_PATHS.client,
    });
    const publicVisitor = await browser.newContext({ baseURL });
    let smokeConversationId: string | null = null;

    try {
      const health = await owner.request.get("/api/health");
      expect(health.status()).toBe(200);
      const healthPayload = requireRecord(
        await health.json(),
        "health payload",
      );
      expect(healthPayload).toMatchObject({
        success: true,
        data: {
          status: "ok",
          environment: "production",
          release: {
            commit: expect.any(String),
            workerVersionId: expect.any(String),
          },
        },
      });
      const healthData = requireRecord(healthPayload.data, "health data");
      const healthRelease = requireRecord(healthData.release, "health release");
      expect(text(healthRelease, "commit")).not.toBe("unknown");
      expect(text(healthRelease, "workerVersionId")).not.toBe("unknown");

      const root = await owner.request.get("/");
      expect(root.ok()).toBe(true);
      const rootHtml = await root.text();
      const assetPaths = [
        ...rootHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g),
      ].map((match) => match[1]);
      expect(assetPaths.length).toBeGreaterThan(0);
      for (const assetPath of assetPaths) {
        expect(
          (await owner.request.get(assetPath)).ok(),
          `asset ${assetPath}`,
        ).toBe(true);
      }

      const authContext = await browser.newContext({ baseURL });
      const signIn = await authContext.request.post("/api/auth/sign-in/email", {
        data: { email: config.owner.email, password: config.owner.password },
      });
      expect(signIn.ok()).toBe(true);
      const authCookies = await authContext.cookies();
      expect(
        authCookies.some(
          (cookie) =>
            /better-auth.*session/i.test(cookie.name) &&
            cookie.secure &&
            cookie.sameSite !== "None",
        ),
      ).toBe(true);
      expect(
        (await authContext.request.get("/api/auth/get-session")).status(),
      ).toBe(200);
      expect((await authContext.request.post("/api/auth/sign-out")).ok()).toBe(
        true,
      );
      const signedOut = unwrap(
        await (await authContext.request.get("/api/auth/get-session")).json(),
      );
      const signedOutRecord =
        signedOut && typeof signedOut === "object" && !Array.isArray(signedOut)
          ? (signedOut as JsonRecord)
          : null;
      expect(signedOutRecord?.user ?? null).toBeNull();
      await authContext.close();

      const crossOrigin = await browser.newContext({
        baseURL,
        extraHTTPHeaders: { Origin: "https://not-blawby.example" },
      });
      const csrfAttempt = await crossOrigin.request.post(
        "/api/auth/sign-in/email",
        {
          data: { email: config.owner.email, password: config.owner.password },
        },
      );
      expect([400, 403]).toContain(csrfAttempt.status());
      await crossOrigin.close();

      const ownerSession = requireRecord(
        unwrap(await (await owner.request.get("/api/auth/get-session")).json()),
        "owner session",
      );
      const ownerUser = requireRecord(ownerSession.user, "owner user");
      const ownerUserId = text(ownerUser, "id");
      if (!ownerUserId) throw new Error("Owner launch-test user id is missing");
      const ownerSessionRecord = requireRecord(
        ownerSession.session,
        "owner session record",
      );
      expect(
        text(
          ownerSessionRecord,
          "activeOrganizationId",
          "active_organization_id",
        ),
      ).toBe(config.practice.id);

      const practiceList = await owner.request.get("/api/practice/list");
      expect(practiceList.ok()).toBe(true);
      const configuredPractice = records(await practiceList.json()).find(
        (practice) => text(practice, "id") === config.practice.id,
      );
      expect(configuredPractice).toBeDefined();
      expect(
        text(configuredPractice as JsonRecord, "slug")?.toLowerCase(),
      ).toContain(launchMarker);
      const setActive = await owner.request.post(
        "/api/auth/organization/set-active",
        { data: { organizationId: config.practice.id } },
      );
      expect(setActive.ok()).toBe(true);
      const isolated = await owner.request.get(
        "/api/practice/00000000-0000-4000-8000-000000000721/sidebar/counts",
      );
      expect(isolated.status()).toBe(403);

      const conversationList = await owner.request.get(
        `/api/conversations?practiceId=${encodeURIComponent(config.practice.id)}&limit=100`,
      );
      expect(conversationList.ok()).toBe(true);
      const existing = records(await conversationList.json()).filter(
        (conversation) => {
          const metadata =
            conversation.user_info && typeof conversation.user_info === "object"
              ? (conversation.user_info as JsonRecord)
              : {};
          return (
            metadata.source === "production_launch_smoke" &&
            conversation.status !== "archived"
          );
        },
      );
      for (const duplicate of existing.slice(1)) {
        const duplicateId = text(duplicate, "id");
        if (!duplicateId)
          throw new Error(
            "Duplicate launch-smoke conversation is missing an id",
          );
        const archived = await owner.request.patch(
          `/api/conversations/${encodeURIComponent(duplicateId)}?practiceId=${encodeURIComponent(config.practice.id)}`,
          { data: { status: "archived" } },
        );
        expect(archived.ok()).toBe(true);
      }
      if (existing[0]) smokeConversationId = text(existing[0], "id");
      if (!smokeConversationId) {
        const created = await owner.request.post(
          `/api/conversations?practiceId=${encodeURIComponent(config.practice.id)}`,
          {
            data: {
              participantUserIds: [ownerUserId],
              metadata: {
                source: "production_launch_smoke",
                mode: "PRACTICE_ASSISTANT",
                title: "[LAUNCH SMOKE] Harmless assistant query",
              },
            },
          },
        );
        expect(created.ok()).toBe(true);
        smokeConversationId = text(
          requireRecord(unwrap(await created.json()), "smoke conversation"),
          "id",
        );
      }
      if (!smokeConversationId)
        throw new Error("Smoke conversation id is missing");

      const clientsResponse = await owner.request.get(
        `/api/clients/${encodeURIComponent(config.practice.id)}?limit=100`,
      );
      expect(clientsResponse.ok()).toBe(true);
      let linkedClient = records(await clientsResponse.json()).find((entry) => {
        const user =
          entry.user && typeof entry.user === "object"
            ? (entry.user as JsonRecord)
            : {};
        return (
          text(user, "email")?.toLowerCase() ===
          config.client.email.toLowerCase()
        );
      });
      if (!linkedClient) {
        const created = await owner.request.post(
          `/api/clients/${encodeURIComponent(config.practice.id)}`,
          {
            data: {
              name: "[LAUNCH SMOKE] Client",
              email: config.client.email,
              status: "active",
            },
          },
        );
        expect(created.ok()).toBe(true);
        const refreshedClients = await owner.request.get(
          `/api/clients/${encodeURIComponent(config.practice.id)}?limit=100`,
        );
        expect(refreshedClients.ok()).toBe(true);
        linkedClient = records(await refreshedClients.json()).find((entry) => {
          const user =
            entry.user && typeof entry.user === "object"
              ? (entry.user as JsonRecord)
              : {};
          return (
            text(user, "email")?.toLowerCase() ===
            config.client.email.toLowerCase()
          );
        });
      }
      expect(linkedClient).toBeDefined();
      const linkedClientUser = requireRecord(
        linkedClient?.user,
        "linked launch-smoke client user",
      );
      expect(text(linkedClientUser, "email")?.toLowerCase()).toBe(
        config.client.email.toLowerCase(),
      );
      expect(
        (
          text(linkedClient as JsonRecord, "name") ??
          text(linkedClientUser, "name")
        )?.toLowerCase(),
      ).toContain("launch smoke");
      const clientSetActive = await client.request.post(
        "/api/auth/organization/set-active",
        {
          data: { organizationId: config.practice.id },
        },
      );
      expect(clientSetActive.ok()).toBe(true);
      const clientSession = requireRecord(
        unwrap(
          await (await client.request.get("/api/auth/get-session")).json(),
        ),
        "client session",
      );
      const clientSessionRecord = requireRecord(
        clientSession.session,
        "client session record",
      );
      expect(
        text(
          clientSessionRecord,
          "activeOrganizationId",
          "active_organization_id",
        ),
      ).toBe(config.practice.id);

      const ownerInvoices = await owner.request.get(
        `/api/invoices/${encodeURIComponent(config.practice.id)}?limit=5`,
      );
      const clientInvoices = await client.request.get(
        `/api/invoices/${encodeURIComponent(config.practice.id)}/client?limit=5`,
      );
      expect(ownerInvoices.ok()).toBe(true);
      expect(clientInvoices.ok()).toBe(true);
      expect(
        (
          await owner.request.get(
            `/api/practice/${encodeURIComponent(config.practice.id)}/sidebar/counts`,
          )
        ).ok(),
      ).toBe(true);
      expect(
        (
          await publicVisitor.request.get(
            `/api/widget/bootstrap?slug=${encodeURIComponent(config.practice.slug)}`,
          )
        ).ok(),
      ).toBe(true);

      const ownerPage = await owner.newPage();
      const clientPage = await client.newPage();
      installBrowserGuards(
        ownerPage,
        errors,
        forbiddenRequests,
        failedRequiredRequests,
      );
      installBrowserGuards(
        clientPage,
        errors,
        forbiddenRequests,
        failedRequiredRequests,
      );
      await ownerPage.goto(
        `/practice/${encodeURIComponent(config.practice.slug)}`,
        { waitUntil: "domcontentloaded" },
      );
      await expectShellBasics(ownerPage);
      await clientPage.goto(
        `/client/${encodeURIComponent(config.practice.slug)}`,
        { waitUntil: "domcontentloaded" },
      );
      await expectShellBasics(clientPage);
      const widgetPage = await owner.newPage();
      installBrowserGuards(
        widgetPage,
        errors,
        forbiddenRequests,
        failedRequiredRequests,
      );
      await widgetPage.goto(
        `/public/${encodeURIComponent(config.practice.slug)}?v=widget`,
        { waitUntil: "domcontentloaded" },
      );
      await expect(widgetPage.locator("body")).toBeVisible();

      const mobile = await browser.newContext({
        baseURL,
        storageState: AUTH_STATE_PATHS.client,
        viewport: { width: 375, height: 667 },
      });
      const mobilePage = await mobile.newPage();
      installBrowserGuards(
        mobilePage,
        errors,
        forbiddenRequests,
        failedRequiredRequests,
      );
      await mobilePage.goto(
        `/client/${encodeURIComponent(config.practice.slug)}`,
        { waitUntil: "domcontentloaded" },
      );
      await expectShellBasics(mobilePage);
      await mobile.close();

      const query =
        "In one short sentence, say that the launch smoke is healthy. Do not create, update, send, or delete anything.";
      expect(
        (
          await owner.request.post(
            `/api/conversations/${encodeURIComponent(smokeConversationId)}/messages?practiceId=${encodeURIComponent(config.practice.id)}`,
            {
              data: { content: query },
            },
          )
        ).ok(),
      ).toBe(true);
      const aiResponse = await owner.request.post("/api/ai/chat", {
        data: {
          conversationId: smokeConversationId,
          practiceSlug: config.practice.slug,
          mode: "PRACTICE_ASSISTANT",
          messages: [{ role: "user", content: query }],
        },
        timeout: 60_000,
      });
      expect(aiResponse.ok()).toBe(true);
      const stream = await aiResponse.text();
      expect(stream).toContain('"done":true');
      expect(stream).not.toContain('"error":true');

      expect(errors).toEqual([]);
      expect(forbiddenRequests).toEqual([]);
      expect(failedRequiredRequests).toEqual([]);
    } finally {
      if (smokeConversationId) {
        const archived = await owner.request.patch(
          `/api/conversations/${encodeURIComponent(smokeConversationId)}?practiceId=${encodeURIComponent(config.practice.id)}`,
          {
            data: { status: "archived" },
          },
        );
        expect(archived.ok()).toBe(true);
      }
      await owner.close();
      await client.close();
      await publicVisitor.close();
    }
  });
});
