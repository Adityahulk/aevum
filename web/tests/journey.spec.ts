import { test, expect } from "@playwright/test";
const headers = { "X-Aevum-Request": "1" };
async function demo(page: any) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore a sample Twin" }).click();
  await expect(
    page.getByRole("heading", { name: "Your biology, in perspective." }),
  ).toBeVisible();
}
test("sample Twin: provenance, biology, grounded explanation, experiment evaluation and history", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await demo(page);
  await expect(
    page.getByText("All health data is synthetic.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore my Twin" }).click();
  await page
    .getByRole("button", { name: /Metabolic health Your lipid/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "What supports this" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore the biology" }).click();
  await expect(
    page.getByRole("heading", { name: "The biology behind your Twin" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Hypothesis Altered nutrient signaling/ })
    .click();
  await expect(
    page.getByText(
      "Lipid and glucose patterns do not identify a specific causal mechanism.",
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Inspect supporting evidence" })
    .click();
  await expect(
    page.getByRole("link", {
      name: "Hallmarks of aging: An expanding universe",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("link", { name: "Ask Aevum" }).click();
  await page
    .getByRole("button", { name: "Why is my metabolic health changing?" })
    .click();
  await expect(page.locator(".assistant-message")).toContainText("ApoB");
  await expect(page.locator(".claim-sources")).toContainText("measurements");
  await page.goto("/#interventions/active");
  await page.getByRole("button", { name: "Open experiment" }).click();
  await page.getByRole("button", { name: "Evaluate response" }).click();
  await expect(
    page.getByRole("heading", { name: "Favorable", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".response-panel")).toContainText("does not prove");
  await page.getByRole("button", { name: "Save decision" }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: /History/ }).click();
  await expect(page.locator(".experiment-card")).toContainText("Favorable");
  await page.reload();
  await expect(page.locator(".experiment-card")).toContainText("Favorable");
  expect(errors).toEqual([]);
});
test("new account: onboarding, mandatory import review, source download, correction, duplicate prevention", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Build my Twin" }).click();
  await page.getByLabel("Your name").fill("Jamie Test");
  await page
    .getByLabel("Email address")
    .fill(`journey-${Date.now()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("long enough test password");
  await page.getByRole("button", { name: "Create my account" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Age", { exact: true }).fill("42");
  await page.getByLabel("Sex for clinical context").selectOption("Female");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Process my health data", { exact: false }).check();
  await page.getByRole("button", { name: "Create my workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Your data, connected." }),
  ).toBeVisible();
  const before = await (await page.request.get("/api/state")).json();
  expect(before.observations).toHaveLength(0);
  await page.getByRole("button", { name: "Add data", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "journey.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "biomarker,value,unit,date,reference_low,reference_high\nApoB,130,mg/dL,2026-01-01,60,100\nApoB,110,mg/dL,2026-08-01,60,100\n",
    ),
  });
  await page.getByRole("button", { name: "Upload & review" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Nothing has changed your Twin yet",
  );
  const pending = await (await page.request.get("/api/state")).json();
  expect(pending.observations).toHaveLength(0);
  await page
    .getByLabel(
      "I checked the results, dates and units against the original source.",
    )
    .check();
  await page.getByRole("button", { name: "Confirm & update my Twin" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Correct", exact: true })
    .first()
    .click();
  await page.getByLabel("Value", { exact: true }).fill("108");
  await page
    .getByLabel("Reason for correction")
    .fill("Verified transcription against source");
  await page.getByLabel("I verified this result against its source.").check();
  await page.getByRole("button", { name: "Save verified result" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator("tbody")).toContainText("108");
  const after = await (await page.request.get("/api/state")).json();
  expect(after.observations).toHaveLength(2);
  expect(after.observations.some((x: any) => x.supersedes)).toBe(true);
  const source = await page.request.get(
    "/api/sources/" + after.artifacts[0].id,
  );
  expect(source.status()).toBe(200);
  expect(await source.text()).toContain("130");
  const dup = await page.request.post("/api/imports", {
    headers,
    multipart: {
      kind: "labs",
      file: {
        name: "journey.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "biomarker,value,unit,date,reference_low,reference_high\nApoB,130,mg/dL,2026-01-01,60,100\nApoB,110,mg/dL,2026-08-01,60,100\n",
        ),
      },
    },
  });
  expect(dup.status()).toBe(409);
});
test("genotype review, private source ownership, consent revocation and empty genomic state", async ({
  page,
  browser,
}) => {
  await demo(page);
  const before = await (await page.request.get("/api/state")).json();
  const file = before.artifacts.find((a: any) => a.kind === "genomics");
  const other = await browser.newContext({ baseURL: "http://127.0.0.1:5173" });
  await other.request.post("/api/auth/demo", { headers });
  expect((await other.request.get("/api/sources/" + file.id)).status()).toBe(
    404,
  );
  await other.close();
  const upload = await page.request.post("/api/imports", {
    headers,
    multipart: {
      kind: "genomics",
      file: {
        name: "genes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("# build 38\nrs4149056 12 21178615 CT\n"),
      },
    },
  });
  expect(upload.status()).toBe(200);
  const draft = await upload.json();
  expect(draft.variants).toBeUndefined();
  expect(
    (
      await page.request.post("/api/imports/" + draft.id + "/confirm", {
        headers,
        data: { rows: [] },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/#settings");
  await page
    .getByRole("button", { name: "Privacy & data", exact: true })
    .click();
  await page.getByRole("switch", { name: "Genomic processing" }).click();
  await expect(
    page.getByRole("switch", { name: "Genomic processing" }),
  ).toHaveAttribute("aria-checked", "false");
  expect((await page.request.get("/api/sources/" + file.id)).status()).toBe(
    403,
  );
  await page.getByRole("switch", { name: "Wearable access" }).click();
  await expect(
    page.getByRole("switch", { name: "Wearable access" }),
  ).toHaveAttribute("aria-checked", "false");
  const state = await (await page.request.get("/api/state")).json();
  expect(state.observations.some((o: any) => o.source === "oura")).toBe(false);
  expect(state.twin.features.HRV).toBeUndefined();
});
test("mobile navigation and every screen fit the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page);
  for (const route of [
    "home",
    "twin",
    "biology",
    "interventions",
    "ai",
    "data",
    "settings",
  ]) {
    await page.goto("/#" + route);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "My Twin", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your Biological Twin", exact: true }),
  ).toBeVisible();
});
