import { test, expect } from "@playwright/test";

test("complete historical import preserves answers, qualified results and provenance", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Explore a sample Twin" }).click();
  await expect(
    page.getByRole("heading", { name: "Your biology, in perspective." }),
  ).toBeVisible();
  await page.goto("/#data");
  await page
    .getByRole("button", { name: "Historical records", exact: true })
    .click();
  const bundle = {
    schema_version: "aevum-history-1",
    client_name: "Synthetic review",
    measurements: [
      {
        name: "ApoB",
        value: "112",
        unit: "mg/dL",
        date: "2026-01-01",
        source_file: "synthetic.csv",
        source_sha256: "a".repeat(64),
        source_kind: "transcribed_table",
      },
      {
        name: "Vitamin B12",
        value: ">2000",
        unit: "pg/mL",
        date: "2026-01-01",
        source_file: "synthetic.csv",
        source_sha256: "a".repeat(64),
        source_kind: "transcribed_table",
      },
    ],
    lifestyle: {
      collected_at: "2026-01-02T12:00:00Z",
      source_file: "synthetic-intake.json",
      source_sha256: "b".repeat(64),
      facts: [
        { source_pointer: "/sleep_schedule", value: "Historical self-report" },
      ],
    },
    fresh_review: { headline: "Synthetic review only", findings: [] },
  };
  await page
    .getByLabel("Choose a historical-record bundle", { exact: false })
    .setInputFiles({
      name: "history.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(bundle)),
    });
  await expect(
    page.getByText(
      "2 source results · 1 supported measurements · 1 historical answers",
    ),
  ).toBeVisible();
  const confirm = page.getByRole("button", {
    name: "Confirm complete historical import",
  });
  await expect(confirm).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /I checked the source records/ })
    .check();
  await confirm.click();
  await expect(
    page.getByRole("button", { name: "Synthetic review · Imported" }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Historical records", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Synthetic review · Imported" })
    .click();
  await page.getByText("All source results", { exact: true }).click();
  await expect(
    page.getByRole("cell", { name: ">2000 pg/mL", exact: true }),
  ).toBeVisible();
  await page
    .getByText("Historical questionnaire · 2026-01-02T12:00:00Z", {
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Historical self-report", { exact: false }),
  ).toBeVisible();
  const response = await page.request.get("/api/historical-imports");
  const record = (await response.json())[0];
  expect(record.status).toBe("confirmed");
  expect(record.rows[0].confidence).toBe(0.65);
  expect(record.lifestyle.collected_at).toBe("2026-01-02T12:00:00Z");
  expect(errors).toEqual([]);
});


test("Twin and Biology retain the focused MVP domain structure", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore a sample Twin" }).click();
  await expect(page.getByRole("heading", { name: "Your biology, in perspective." })).toBeVisible();
  await page.goto("/#twin");
  await expect(page.locator(".twin-domain")).toHaveCount(7);
  for (const name of ["Hematology", "Liver context", "Kidney context", "Nutritional & endocrine context", "Immune context", "Cognitive context", "Molecular aging"]) {
    await expect(page.getByRole("heading", {name, exact: true})).toHaveCount(0);
  }
  await page.goto("/#biology/liver");
  await expect(page.locator(".biology-map h2")).not.toHaveText("Liver context");
  await expect(page.locator(".graph-layers")).toBeVisible();
  await expect(page.locator(".tabs button")).toHaveCount(7);
  for (const name of ["Recovery & resilience", "Muscle & strength", "Functional fitness", "Body composition"]) {
    await page.locator(".tabs").getByRole("button", {name, exact: true}).click();
    await expect(page.locator(".biology-map h2")).toHaveText(name);
    await expect(page.getByRole("heading", {name: "Your data in this domain"})).toBeVisible();
  }
});


test("unmeasured Biology domains show missing groups and supporting context", async ({page}) => {
  await page.route("**/api/state", async route => {
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({response});
    const state = await response.json();
    const recovery = state.twin.domains.find((d: any) => d.id === "recovery");
    recovery.signals = []; recovery.phenotype = null; recovery.context_count = 1;
    recovery.coverage = 0; recovery.available_group_count = 0;
    recovery.coverage_groups.forEach((g: any) => {g.covered = false; g.available = [];});
    recovery.lifestyle_context = [{label: "Sleep duration", value: "6 hours", date: "2024-01-01", source: "Historical questionnaire"}];
    state.twin.relationships = state.twin.relationships.filter((r: any) => r.domain !== "recovery");
    await route.fulfill({response, json: state});
  });
  await page.goto("/");
  await page.getByRole("button", {name: "Explore a sample Twin"}).click();
  await expect(page.getByRole("heading", {name: "Your biology, in perspective."})).toBeVisible();
  await page.goto("/#biology/recovery");
  await expect(page.locator(".tabs button")).toHaveCount(7);
  await expect(page.getByText("Supporting context available; direct measurements needed")).toBeVisible();
  await expect(page.getByText("Missing / outdated", {exact: true})).toHaveCount(3);
  await page.getByText("1 relevant answers · view source context").click();
  await expect(page.getByText("6 hours", {exact: true})).toBeVisible();
  await expect(page.getByText("Historical questionnaire", {exact: false})).toBeVisible();
});
