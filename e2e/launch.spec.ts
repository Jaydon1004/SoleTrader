import { expect, test } from "@playwright/test";

test("renders the business selector without horizontal overflow", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "SoleTrader Accounts" }),
  ).toBeVisible();
  await expect(page.getByText("Choose a business workspace")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("validates and dismisses the new business dialog", async ({ page }) => {
  await page.goto("/");

  const newBusiness = page.getByRole("button", { name: "New business" });
  await newBusiness.click();

  const dialog = page.getByRole("dialog", { name: "Create a business" });
  const name = dialog.getByRole("textbox", { name: "Business name" });
  const create = dialog.getByRole("button", { name: "Create and open" });

  await expect(name).toBeFocused();
  await expect(create).toBeDisabled();
  await name.fill("A");
  await expect(create).toBeDisabled();
  await name.fill("Acme Plumbing");
  await expect(create).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(newBusiness).toBeFocused();
});

test("switches between active and archived workspaces", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "View archive" }).click();
  await expect(
    page.getByRole("heading", { name: "Archived businesses" }),
  ).toBeVisible();
  await expect(page.getByText("No archived businesses")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Active businesses" }),
  ).toBeVisible();
});
