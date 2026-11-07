import { test, expect, type Page } from "@playwright/test";
async function navigate(page: Page, name: string) {
  await expect(
    page.getByRole("main").getByRole("heading", { level: 1 }),
  ).toBeVisible();
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: new RegExp("^" + name) })
    .click();
  await expect(
    page.getByRole("main").getByRole("heading", { level: 1 }),
  ).toHaveText(name === "Overview" ? "Your market overview" : name);
}
test("all workspaces render without browser errors or page overflow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Import my holdings" }),
  ).toBeVisible();
  for (const name of [
    "Markets",
    "Setup scanner",
    "Portfolio",
    "Research",
    "AI desk",
    "IPOs",
    "Strategy lab",
    "Journal",
    "Integrations",
    "Overview",
  ]) {
    await navigate(page, name);
    await expect(page.getByRole("main")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      name + " fits the screen",
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
test("CSV import has a non-mutating preview and an explicit save step", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Import my holdings" }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "test-holdings.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "symbol,exchange,quantity,averagePrice,sector\nINFY,NSE,2,1400,Technology",
    ),
  });
  await page.getByRole("button", { name: "Review holdings" }).click();
  await expect(page.getByText("Step 2 of 2")).toBeVisible();
  expect(
    (await (await request.get("/api/dashboard")).json()).portfolio.positions,
  ).toHaveLength(0);
  await page.getByRole("button", { name: "Import 1 holdings" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Your holdings", exact: true }),
  ).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove INFY", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Choose holdings file" }),
  ).toBeVisible();
});
test("modal typing keeps focus through a real stream status update and closes with Escape", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Import my holdings" }).click();
  await page.getByText("Paste CSV or see the required columns").click();
  const text = page.getByLabel("CSV contents");
  await text.fill("symbol,quantity,averagePrice");
  await page.waitForTimeout(11000);
  await expect(text).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Import my holdings" }),
  ).toBeFocused();
});
test("unconnected AI and scanner guide setup without fabricating results", async ({
  page,
}) => {
  await page.goto("/");
  await navigate(page, "AI desk");
  await expect(
    page.getByRole("button", { name: "Analyze evidence" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: /What are the strongest themes/ })
    .click();
  await expect(
    page.getByLabel("What would you like to understand?"),
  ).toHaveValue(/strongest themes/);
  await navigate(page, "Setup scanner");
  await expect(
    page.getByRole("button", { name: "Check my setup" }),
  ).toBeDisabled();
  await page.getByLabel("Average window").fill("60");
  await expect(page.getByText(/average covers 60 minutes/)).toBeVisible();
  await expect(page.getByText("CONDITIONS MET", { exact: true })).toHaveCount(
    0,
  );
});

test("sourced AI responses expose their evidence and accept follow-up questions", async ({
  page,
}) => {
  const now = new Date().toISOString();
  const run = {
    id: "test-run",
    threadId: "11111111-1111-4111-8111-111111111111",
    question: "Explain the test evidence",
    model: "test-fixture",
    createdAt: now,
    coverage: {
      items: 1,
      publishers: 1,
      oldest: now,
      newest: now,
      excerptOnly: true,
      portfolioIncluded: false,
    },
    usage: null,
    sources: [
      {
        id: "S1",
        kind: "article",
        title: "Isolated browser-test source",
        source: "Test fixture",
        url: "https://example.com/source",
        asOf: now,
        content: "This content exists only in a browser test.",
      },
    ],
    answer: {
      summary: "This is an isolated test response, not a real model answer.",
      findings: [
        {
          heading: "Test observation",
          kind: "observation",
          assessment: "A cited test finding.",
          implication: "Verify the original source.",
          evidenceIds: ["S1"],
        },
      ],
      risks: ["A test fixture is not market evidence."],
      scenarios: [],
      openQuestions: ["What additional evidence is required?"],
    },
  };
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({ json: { configured: true, model: "test-fixture" } }),
  );
  await page.route("**/api/ai/ask", (route) => route.fulfill({ json: run }));
  await page.goto("/");
  await navigate(page, "AI desk");
  await page
    .getByLabel("What would you like to understand?")
    .fill("Explain the test evidence");
  await page.getByRole("button", { name: "Analyze evidence" }).click();
  await expect(
    page.getByRole("heading", { name: "Test observation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "S1", exact: true }).click();
  await expect(page.getByText("Isolated browser-test source")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open original source" }),
  ).toHaveAttribute("href", "https://example.com/source");
  await expect(
    page.getByRole("heading", { name: "Ask a follow-up" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("populated scanner explains its checks, plan and AI handoff", async ({
  page,
}) => {
  const { analyzeSetup, defaultSetup } = await import("../src/trading");
  const start = Date.parse("2026-11-06T04:00:00Z"),
    now = start + 30 * 60000 + 10000;
  const bars = Array.from({ length: 30 }, (_, i) => ({
    time: new Date(start + i * 60000).toISOString(),
    open: i < 27 ? 100 : i === 27 ? 99.1 : i === 28 ? 99.2 : 99.3,
    high: i < 27 ? 100.2 : i === 27 ? 99.2 : i === 28 ? 99.25 : 99.35,
    low: i < 27 ? 99.8 : i === 27 ? 98.9 : i === 28 ? 99.05 : 99.15,
    close: i < 27 ? 100 : i === 27 ? 99.1 : i === 28 ? 99.2 : 99.3,
    volume: i === 29 ? 250 : 100,
  }));
  const result = {
    ...analyzeSetup(bars, defaultSetup, now),
    id: "isolated-test-scan",
    symbol: "INFY",
    exchange: "NSE",
    source: "Test fixture only",
    createdAt: new Date(now).toISOString(),
    fetchedAt: new Date(now).toISOString(),
  };
  await page.clock.install({ time: new Date(now) });
  await page.route("**/api/status", async (route) => {
    const original = await route.fetch();
    await route.fulfill({
      json: {
        ...(await original.json()),
        upstox: true,
        marketProvider: "upstox",
      },
    });
  });
  await page.route("**/api/scanner", (route) =>
    route.fulfill({ json: [result] }),
  );
  await page.goto("/");
  await navigate(page, "Setup scanner");
  await page.getByRole("button", { name: "Check my setup" }).click();
  await expect(page.getByText("CONDITIONS MET", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Upward confirmation", { exact: true }),
  ).toBeVisible();
  await page
    .getByText("Illustrative trade plan · not an order", { exact: true })
    .click();
  await expect(
    page.getByText("ILLUSTRATIVE STOP", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Discuss this setup with AI" })
    .click();
  await expect(page.getByLabel("Focus symbol · optional")).toHaveValue("INFY");
  await expect(
    page.getByLabel("What would you like to understand?"),
  ).toHaveValue(/latest INFY/);
});
