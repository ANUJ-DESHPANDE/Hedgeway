import { test, expect, type Page } from "@playwright/test";
async function navigate(page: Page, name: string) {
  const nav=page.getByRole('navigation',{name:'Main navigation'});
  await expect(nav).toBeVisible();
  const close=page.getByRole('button',{name:'Close dialog',exact:true});
  if(await close.isVisible())await close.click();
  if(name==='AI desk'){await page.getByRole('button',{name:'Ask Hedgeway',exact:true}).click();await expect(page.getByRole('dialog',{name:'Ask Hedgeway'})).toBeVisible();return;}
  if(['Markets','Research','IPOs','Setup scanner'].includes(name)){
    await nav.getByRole('button',{name:'Explore',exact:true}).click();
    const label=({'Markets':'Companies','Research':'Stories','IPOs':'IPOs','Setup scanner':'Setups'} as Record<string,string>)[name];
    await page.getByRole('navigation',{name:'Explore sections'}).getByRole('button',{name:label,exact:true}).click();
  }else if(name==='Journal'||name==='Strategy lab'){
    await nav.getByRole('button',{name:'Notebook',exact:true}).click();
    await page.getByRole('button',{name:name==='Journal'?'Notes & decisions':'Test a hypothesis',exact:true}).click();
  }else if(name==='Overview'){await page.evaluate(()=>{location.hash='Overview'})}
  else await nav.getByRole('button',{name:name==='Integrations'?'Connections & settings':name,exact:true}).click();
  if(name==='Markets')await expect(page.getByRole('complementary',{name:'Watchlist',exact:true})).toBeVisible();
  else if(!['Today','Notebook'].includes(name))await expect(page.getByRole('main').getByRole('heading',{level:1})).toHaveText(name==='Overview'?'Your market overview':name);
}
test("all workspaces render without browser errors or page overflow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#Markets");
  await expect(
    page.getByRole("button", { name: "Explore", exact: true }),
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
  await page.goto("/#Overview");
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
  await page.goto("/#Overview");
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
  await page.goto("/#Markets");
  await navigate(page, "AI desk");
  await expect(
    page.getByRole("button", { name: "Analyze evidence" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: /What’s moving the market/ })
    .click();
  await expect(
    page.getByLabel("What would you like to understand?"),
  ).toHaveValue(/moving the market/);
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
  await page.goto("/#Markets");
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
  await expect(page.getByLabel("What would you like to understand?")).toHaveAttribute("placeholder", "Ask a follow-up…");
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
    id: "11111111-1111-4111-8111-111111111111",
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
  await page.route("**/api/scanner/history", (route) =>
    route.fulfill({
      json: [
        {
          id: result.id,
          symbol: result.symbol,
          exchange: result.exchange,
          state: result.state,
          createdAt: result.createdAt,
        },
      ],
    }),
  );
  await page.route(`**/api/scanner/history/${result.id}`, (route) =>
    route.fulfill({ json: result }),
  );
  await page.goto("/#Markets");
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
  await page.getByLabel("Average window").fill("25");
  await expect(page.getByText(/Settings have changed/)).toBeVisible();
  await page.clock.fastForward(180000);
  await expect(page.getByText("HISTORICAL", { exact: true })).toBeVisible();
  await expect(page.getByText("CONDITIONS MET", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByText("Recent scans · review what the data showed", { exact: true })
    .click();
  await page.getByRole("button", { name: "Open saved scan" }).click();
  await expect(page.getByText("HISTORICAL", { exact: true })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export scan evidence" }).click(),
  ]);
  const { readFile } = await import("node:fs/promises");
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(exported.scan.state).toBe("conditions_met");
  expect(exported.scan.parameters.lookback).toBe(20);
  expect(exported.scan.bars).toEqual(bars);
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({ json: { configured: true, model: "test-fixture" } }),
  );
  let sent: any;
  await page.route("**/api/ai/ask", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({
      status: 503,
      json: { error: "Test request captured without contacting a model." },
    });
  });
  await page
    .getByRole("button", { name: "Discuss this setup with AI" })
    .click();
  await expect(page.getByLabel("Focus symbol · optional")).toHaveValue("INFY");
  await expect(
    page.getByLabel("What would you like to understand?"),
  ).toHaveValue(/saved NSE:INFY/);
  await page.getByRole("button",{name:/Settings · INFY/}).click();
  await expect(page.getByText(/Pinned scan: NSE:INFY/)).toBeVisible();
  await page.getByRole("button", { name: "Analyze evidence" }).click();
  await expect(page.getByRole("alert")).toContainText("Test request captured");
  expect(sent.scanId).toBe(result.id);
  expect(sent.symbol).toBe("INFY");
});

test("Explore reaches a page without scrolling through navigation", async ({
  page,
}) => {
  await page.goto("/#Markets");
  await page
    .getByRole("button", { name: "Quick navigation", exact: true })
    .click();
  await page.getByLabel("Search pages").fill("Journal");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Journal/ })
    .click();
  await expect(
    page.getByRole("main").getByRole("heading", { level: 1 }),
  ).toHaveText("Journal");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("market candles support exploration, exports and a learning handoff", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const bars = Array.from({ length: 75 }, (_, i) => ({
    time: new Date(
      Date.parse("2026-11-11T03:45:00Z") + i * 300000,
    ).toISOString(),
    open: 100 + i * 0.1,
    high: 101 + i * 0.1,
    low: 99 + i * 0.1,
    close: 100.5 + i * 0.1,
    volume: 1000 + i * 10,
  }));
  await page.route("**/api/watchlist", (route) =>
    route.fulfill({
      json: [
        {
          symbol: "INFY",
          exchange: "NSE",
          created_at: new Date().toISOString(),
        },
      ],
    }),
  );
  await page.route("**/api/market/chart?*", (route) =>
    route.fulfill({
      json: {
        symbol: "INFY",
        exchange: "NSE",
        interval: new URL(route.request().url()).searchParams.get("interval"),
        bars,
        source: "Isolated chart fixture",
        fetchedAt: new Date().toISOString(),
      },
    }),
  );
  await page.goto("/#Markets");
  await navigate(page, "Markets");
  await expect(page.locator(".candle-canvas canvas").first()).toBeVisible();
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Line", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Session VWAP", exact: true }).click();
  await page.getByLabel("Average window", { exact: true }).selectOption("50");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download candle CSV" }).click();
  expect((await download).suggestedFilename()).toContain("INFY");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Explain what I’m seeing" }).click();
  await expect(page.getByLabel("Focus symbol · optional")).toHaveValue("INFY");
  await expect(page.getByLabel('Conversation approach')).toHaveValue('learn');
  await page.getByLabel('Conversation approach').selectOption('challenge');
  await expect(page.getByLabel('Conversation approach')).toHaveValue('challenge');
  expect(errors).toEqual([]);
});

test("assistant draft survives closing the chart conversation", async ({
  page,
}) => {
  await page.goto("/#Markets");
  await page.getByRole("button", { name: "Ask Hedgeway", exact: true }).click();
  const question = page.getByLabel("What would you like to understand?");
  await question.fill("Help me weigh the risk of a rebound before acting");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Ask Hedgeway", exact: true }).click();
  await expect(question).toHaveValue(
    "Help me weigh the risk of a rebound before acting",
  );
});

test("workspace research follows the selected company and labels market-wide mode", async ({
  page,
}) => {
  await page.route("**/api/watchlist", (r) =>
    r.fulfill({
      json: [
        { symbol: "INFY", exchange: "NSE" },
        { symbol: "RELIANCE", exchange: "NSE" },
      ],
    }),
  );
  await page.route("**/api/research?*", (r) => r.fulfill({ json: [] }));
  await page.goto("/#Markets");
  await expect(
    page.getByText("Research for INFY", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /RELIANCE.*Awaiting feed/ }).click();
  await expect(
    page.getByText("Research for RELIANCE", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Show all market news", exact: true })
    .click();
  await expect(
    page.getByText("Across the market", { exact: true }),
  ).toBeVisible();
});

test("reopening the same company preserves the current AI draft", async ({
  page,
}) => {
  await page.route("**/api/watchlist", (r) =>
    r.fulfill({ json: [{ symbol: "INFY", exchange: "NSE" }] }),
  );
  await page.goto("/#Markets");
  await page.getByRole("button", { name: "Explain what I’m seeing" }).click();
  await page
    .getByLabel("What would you like to understand?")
    .fill("Keep my company-specific draft while I inspect the chart");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Explain what I’m seeing" }).click();
  await expect(
    page.getByLabel("What would you like to understand?"),
  ).toHaveValue("Keep my company-specific draft while I inspect the chart");
});

test("late AI replies cannot replace a newly selected company's discussion", async ({
  page,
}) => {
  await page.route("**/api/watchlist", (r) =>
    r.fulfill({
      json: [
        { symbol: "INFY", exchange: "NSE" },
        { symbol: "RELIANCE", exchange: "NSE" },
      ],
    }),
  );
  await page.route("**/api/ai/status", (r) =>
    r.fulfill({ json: { configured: true, model: "test-fixture" } }),
  );
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let received!: () => void;
  const requested = new Promise<void>((r) => (received = r));
  await page.route("**/api/ai/ask", async (r) => {
    received();
    await held;
    await r.fulfill({
      json: {
        id: "old-run",
        threadId: "old-thread",
        question: "INFY only",
        createdAt: new Date().toISOString(),
        model: "test-fixture",
        sources: [],
        coverage: { items: 0, publishers: 0, excerptOnly: true },
        answer: {
          summary: "Old INFY answer",
          findings: [],
          risks: [],
          scenarios: [],
          openQuestions: [],
        },
      },
    });
  });
  await page.goto("/#Markets");
  await page.getByRole("button", { name: "Explain what I’m seeing" }).click();
  await page
    .getByRole("button", { name: "Analyze evidence", exact: true })
    .click();
  await requested;
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: /RELIANCE.*Awaiting feed/ }).click();
  await page.getByRole("button", { name: "Explain what I’m seeing" }).click();
  await expect(page.getByLabel("Focus symbol · optional")).toHaveValue(
    "RELIANCE",
  );
  release();
  await expect(
    page.getByRole("button", { name: "Analyze evidence", exact: true }),
  ).toBeEnabled();
  await expect(page.getByText("Old INFY answer", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByLabel("What would you like to understand?"),
  ).toHaveValue(/NSE:RELIANCE/);
});

test("desktop assistant leaves the watchlist interactive", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Phone uses a focused modal conversation.",
  );
  await page.route("**/api/watchlist", (r) =>
    r.fulfill({
      json: [
        { symbol: "INFY", exchange: "NSE" },
        { symbol: "RELIANCE", exchange: "NSE" },
      ],
    }),
  );
  await page.goto("/#Markets");
  await page.getByRole("button", { name: "Ask Hedgeway", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toHaveAttribute(
    "aria-modal",
    "true",
  );
  await page.getByRole("button", { name: /RELIANCE.*Awaiting feed/ }).click();
  await expect(page.getByLabel("Chart company")).toHaveValue("NSE:RELIANCE");
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("chart context is restored after opening a saved discussion", async ({
  page,
}) => {
  await page.route("**/api/watchlist", (r) =>
    r.fulfill({ json: [{ symbol: "INFY", exchange: "NSE" }] }),
  );
  await page.route("**/api/ai/threads", (r) =>
    r.fulfill({ json: [{ id: "saved-thread", title: "Earlier discussion" }] }),
  );
  await page.route("**/api/ai/threads/saved-thread", (r) =>
    r.fulfill({ json: [] }),
  );
  await page.goto("/#Markets");
  await page.getByRole("button", { name: "Explain what I’m seeing" }).click();
  await page.getByLabel("Saved discussions").selectOption("saved-thread");
  await expect(page.getByLabel("Focus symbol · optional")).toHaveValue("");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Explain what I’m seeing" }).click();
  await expect(page.getByLabel("Focus symbol · optional")).toHaveValue("INFY");
});

test("late saved-discussion loads cannot overwrite chart context", async ({
  page,
}) => {
  await page.route("**/api/watchlist", (r) =>
    r.fulfill({
      json: [
        { symbol: "INFY", exchange: "NSE" },
        { symbol: "RELIANCE", exchange: "NSE" },
      ],
    }),
  );
  await page.route("**/api/ai/threads", (r) =>
    r.fulfill({ json: [{ id: "saved-thread", title: "Earlier discussion" }] }),
  );
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let received!: () => void;
  const requested = new Promise<void>((r) => (received = r));
  await page.route("**/api/ai/threads/saved-thread", async (r) => {
    received();
    await held;
    await r.fulfill({ json: [] });
  });
  await page.goto("/#Markets");
  await page.getByRole("button", { name: "Explain what I’m seeing" }).click();
  await page.getByLabel("Saved discussions").selectOption("saved-thread");
  await requested;
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: /RELIANCE.*Awaiting feed/ }).click();
  await page.getByRole("button", { name: "Explain what I’m seeing" }).click();
  release();
  await expect(
    page.getByRole("button", { name: "New discussion", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Focus symbol · optional")).toHaveValue(
    "RELIANCE",
  );
});

test('Today is the useful default and moves from discovery to a company',async({page})=>{
 await page.goto('/');await expect(page.getByRole('heading',{name:'Today, in perspective.'})).toBeVisible();
 await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Today',exact:true})).toHaveAttribute('aria-current','page');
 await page.getByLabel('Find a company from Today').fill('Infosys');
 await page.locator('.daily-search-results').getByRole('button').first().click();
 await expect(page.getByLabel('Chart company')).toHaveValue('NSE:INFY');
});
