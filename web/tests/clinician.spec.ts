import { test, expect, Page } from "@playwright/test";

async function setup(page: Page, admin = false) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore a sample Twin" }).click();
  await expect(
    page.getByRole("heading", { name: "Your biology, in perspective." }),
  ).toBeVisible();
  const me = await (await page.request.get("/api/me")).json();
  me.profile.demo = false;
  me.is_admin = admin;
  me.clinician_request = {};
  await page.route("**/api/me", (route) => route.fulfill({ json: me }));
  await page.reload();
  return me;
}

for (const mobile of [false, true]) {
  test(`call request persists across Home and Twin (${mobile ? "mobile" : "desktop"})`, async ({
    page,
  }) => {
    const me = await setup(page);
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    let submissions = 0;
    await page.route("**/api/clinician-requests", async (route) => {
      submissions++;
      expect(route.request().postDataJSON()).toEqual({
        origin: "home",
        share_report: true,
      });
      me.clinician_request = {
        id: "request-1",
        status: "requested",
        origin: "home",
      };
      await route.fulfill({ json: me.clinician_request });
    });
    await page
      .getByRole("button", { name: "Discuss this with a longevity clinician" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByText("Requesting a call does not book or charge you.", {
        exact: false,
      }),
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Request a call", exact: true })
      .click();
    await expect(page.locator(".clinician-status")).toHaveText(
      "Call requested",
    );
    await page.goto("/#twin");
    await expect(page.locator(".clinician-status")).toHaveText(
      "Call requested",
    );
    await page.reload();
    await expect(page.locator(".clinician-status")).toHaveText(
      "Call requested",
    );
    expect(submissions).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .locator(".clinician-card")
      .screenshot({
        path: `test-results/clinician-${mobile ? "mobile" : "desktop"}.png`,
      });
  });
}

test("admin can track a request and download a report", async ({ page }) => {
  await setup(page, true);
  const request = {
    id: "request-1",
    name: "Test member",
    email: "member@example.test",
    status: "requested",
    origin: "home",
    created_at: "2026-09-29T00:00:00Z",
    report_available: true,
  };
  await page.route("**/api/admin/clinician-requests", (route) =>
    route.fulfill({ json: [request] }),
  );
  await page.route("**/api/admin/clinician-requests/request-1", (route) => {
    expect(route.request().postDataJSON()).toEqual({ status: "scheduled" });
    return route.fulfill({ json: { ...request, status: "scheduled" } });
  });
  await page.route(
    "**/api/admin/clinician-requests/request-1/report",
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><h1>Clinician report</h1>",
      }),
  );
  await page.goto("/#admin");
  await expect(
    page.getByRole("heading", { name: "Clinician call requests" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "member@example.test" }),
  ).toBeVisible();
  await page.getByLabel("Status for Test member").selectOption("scheduled");
  await expect(page.getByLabel("Status for Test member")).toHaveValue(
    "scheduled",
  );
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download report" }).click();
  expect((await downloaded).suggestedFilename()).toBe(
    "aevum-clinician-report-request-1.html",
  );
  await page.screenshot({
    path: "test-results/clinician-admin.png",
    fullPage: true,
  });
});

test("failed request stays retryable and does not show success", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/clinician-requests", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Please try again shortly." },
    }),
  );
  await page.goto("/#twin");
  await page
    .getByRole("button", { name: "Request a call", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Request a call", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Please try again shortly.",
  );
  await expect(page.locator(".clinician-status")).toHaveCount(0);
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Request a call", exact: true }),
  ).toBeEnabled();
});
