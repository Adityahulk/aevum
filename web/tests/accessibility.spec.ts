import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("WCAG AA checks across core screens", async ({ page }) => {
  await page.goto("/");
  let results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.getByRole("button", { name: "Explore a sample Twin" }).click();
  await expect(page.locator("h1")).toContainText("Your biology");
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
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
      route,
    ).toEqual([]);
  }
});
test("WCAG AA checks across mobile screens and sheets", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore a sample Twin" }).click();
  await expect(page.locator("h1")).toContainText("Your biology");
  await page.setViewportSize({ width: 390, height: 844 });
  const check = async (label: string) => {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
      label,
    ).toEqual([]);
  };
  for (const route of [
    "home",
    "twin/recovery",
    "interventions/active",
    "ai",
    "you",
  ]) {
    await page.goto("/#" + route);
    await expect(page.locator("h1")).toBeVisible();
    await check(route);
  }
  await page.goto("/#interventions/active");
  await page
    .getByRole("button", { name: /^Check in/ })
    .first()
    .click();
  await expect(page.getByRole("dialog", { name: "Check in" })).toBeVisible();
  await check("check-in sheet");
});
