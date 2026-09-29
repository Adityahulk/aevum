import { test, expect, Page } from "@playwright/test";

async function sample(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore a sample Twin" }).click();
  await expect(
    page.getByRole("heading", { name: "Your biology, in perspective." }),
  ).toBeVisible();
  const state = await (await page.request.get("/api/state")).json();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".mobile-tabbar")).toBeVisible();
  return state;
}

test("mobile sources distinguish imported context, review, permission and live connections", async ({
  page,
}) => {
  const state = await sample(page);
  state.genomic_findings = [{ id: "reported-dna", gene: "SLCO1B1" }];
  state.artifacts = [{ id: "report", kind: "labs", status: "review_required" }];
  await page.route("**/api/state", (route) => route.fulfill({ json: state }));
  await page.route("**/api/wearables/providers", (route) =>
    route.fulfill({ json: { providers: [] } }),
  );
  await page.goto("/#you");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "What’s covered", exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Lab results Received · review needed/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /DNA · optional 1 supported finding available/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Wearables Imported data · no active connection/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Lifestyle & health history/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Lab results Received/ }).click();
  await expect(
    page.getByRole("button", { name: "Source documents", exact: true }),
  ).toHaveClass(/active/);
  await page.goto("/#you");
  await page.getByRole("button", { name: /DNA · optional/ }).click();
  await expect(
    page.getByRole("button", { name: "Genetics", exact: true }),
  ).toHaveClass(/active/);
  await page.goto("/?connected=oura#data");
  await expect(
    page.getByRole("button", { name: "Wearables", exact: true }),
  ).toHaveClass(/active/);
});

test("mobile protocol leads with one best fit and keeps alternatives available", async ({
  page,
}) => {
  await sample(page);
  await page.goto("/#interventions/recommended");
  await expect(
    page.locator(".recommendation-list").first().locator(".recommendation"),
  ).toHaveCount(1);
  await expect(
    page.getByText(/Explore \d+ other options/, { exact: false }),
  ).toBeVisible();
  await page.getByText(/Explore \d+ other options/, { exact: false }).click();
  await expect(
    page.locator(".m-alternative-options .recommendation"),
  ).toHaveCount(3);
});

test("home reviews only meaningful Twin updates after the initial version", async ({
  page,
}) => {
  const state = await sample(page);
  state.notifications = [
    { id: "initial", type: "TwinUpdated", twin_version: 1, title: "Twin created", read: false },
  ];
  await page.route("**/api/state", (route) => route.fulfill({ json: state }));
  await page.goto("/#home");
  await page.reload();
  await expect(page.getByText("A MEANINGFUL UPDATE")).toHaveCount(0);
  state.notifications.push({
    id: "changed",
    type: "TwinUpdated",
    twin_version: 2,
    title: "New measurements added",
    read: false,
  });
  await page.reload();
  await expect(page.getByText("A MEANINGFUL UPDATE")).toBeVisible();
  await expect(page.getByRole("heading", { name: "New measurements added" })).toBeVisible();
});

test("product analytics accepts only allowlisted behavior names", async ({
  page,
}) => {
  await sample(page);
  let eventBody: unknown;
  await page.route("**/api/product-events", async (route) => {
    eventBody = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true } });
  });
  await page.evaluate(() =>
    fetch("/api/product-events", {
      method: "POST",
      headers: { "X-Aevum-Request": "1", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ask_answer_received" }),
    }),
  );
  expect(eventBody).toEqual({ name: "ask_answer_received" });
});

test("normal results remain scoped and supporting information stays visible", async ({
  page,
}) => {
  const state = await sample(page);
  state.experiments = [];
  state.twin.priorities = [];
  state.twin.domains.forEach((d: any, i: number) => {
    d.severity = "None";
    d.priority = 0;
    d.state = i < 3 ? "Within source intervals" : "Supporting context only";
    d.coverage = i < 3 ? 50 : 0;
    d.trend = "Insufficient data";
    d.lifestyle_context =
      i >= 3 ? [{ label: "Exercise", value: "Weekly" }] : [];
    d.genomic_context = [];
    d.context_signals = [];
  });
  await page.route("**/api/state", (route) => route.fulfill({ json: state }));
  await page.goto("/#home");
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "No flagged patterns in assessed systems",
    }),
  ).toBeVisible();
  await expect(page.getByText("All clear", { exact: true })).toHaveCount(0);
  await page.goto("/#twin");
  await expect(
    page.getByRole("heading", { name: "More information needed" }),
  ).toBeVisible();
  await expect(
    page.getByText("Reported lifestyle available · direct measurements needed"),
  ).toHaveCount(4);
  await expect(page.locator(".m-domain-list button")).toHaveCount(7);
  await page.screenshot({
    path: "../.runtime/screenshots/product-twin.png",
    fullPage: true,
  });
});

test("missing follow-up leads to collection and complete follow-up leads to review", async ({
  page,
}) => {
  const state = await sample(page);
  const plan = state.experiments[0];
  plan.status = "Evaluation due";
  plan.start_date = new Date(Date.now() - 90 * 86400000).toISOString();
  plan.planned_duration_weeks = 12;
  plan.baseline = { APOB: { value: 110, source: "lab_csv" } };
  plan.baseline_observation_ids = ["starting-point"];
  state.experiments = [plan];
  state.observations = [
    {
      id: "wrong-source",
      concept_id: "APOB",
      source: "lab_pdf",
      quality_status: "verified",
      effective_time: new Date().toISOString(),
      value: 90,
    },
  ];
  await page.route("**/api/state", (route) => route.fulfill({ json: state }));
  await page.goto("/#home");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Add follow-up measurements" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add follow-up measurements" })
    .click();
  await expect(page).toHaveURL(/#data$/);
  state.observations[0].source = "lab_csv";
  await page.goto("/#home");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Review measured response" }),
  ).toBeVisible();
});

test("mobile Ask leads with current answers and archives outdated history", async ({
  page,
}) => {
  await sample(page);
  await page.route("**/api/ai/history", (route) =>
    route.fulfill({
      json: [
        {
          id: "old",
          question: "An earlier question",
          answer: "An earlier saved answer",
          mode: "Grounded guide",
          claims: [],
        },
        {
          id: "new",
          question: "What should I eat?",
          answer: "Start with the meal changes we discussed.",
          mode: "Grounded AI",
          confidence: "Moderate",
          claims: [
            {
              text: "Your recorded preference informs these options.",
              confidence: "Moderate",
              source_ids: ["profile:diet"],
            },
          ],
          action_items: ["Choose a practical meal substitution."],
          suggestions: ["Explain my options", "More detail"],
          source_cards: [],
        },
      ],
    }),
  );
  await page.goto("/#ai");
  await expect(
    page.getByText("Earlier answer archived", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("An earlier saved answer"),
  ).not.toBeVisible();
  await expect(
    page.getByText("Start with the meal changes we discussed."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Get an updated answer" }),
  ).toBeVisible();
  await expect(
    page.getByText("Your recorded preference informs these options."),
  ).not.toBeVisible();
  await page.getByText("Why this fits your data", { exact: true }).click();
  await expect(
    page.getByText("Your recorded preference informs these options."),
  ).toBeVisible();
  await expect(page.locator(".ai-follow-ups button")).toHaveCount(1);
  await page.screenshot({
    path: "../.runtime/screenshots/product-ask.png",
    fullPage: true,
  });
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, "height", {
      configurable: true,
      get: () => innerHeight - 300,
    });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator(".chat-composer")).toHaveCSS("bottom", "308px");
});

test("mobile screens fit a small viewport and keep desktop presentation separate", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await sample(page);
  await page.setViewportSize({ width: 360, height: 780 });
  for (const route of [
    "home",
    "interventions/recommended",
    "you",
    "twin/metabolic",
    "ai",
  ]) {
    await page.goto("/#" + route);
    await expect(page.locator(".loading")).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path:
        "../.runtime/screenshots/product-" + route.replace("/", "-") + ".png",
      fullPage: true,
    });
  }
  await page.goto("/#interventions/recommended");
  await expect(
    page.getByRole("heading", { name: "Your plan", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page.getByRole("heading", { name: "Discover what works for you." }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Primary", exact: true }),
  ).not.toBeVisible();
  expect(errors).toEqual([]);
});
