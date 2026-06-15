import { test, expect } from "@playwright/test";

test.describe("public pages", () => {
  test("landing page loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  });

  test("sign-in form renders", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("sign-up form renders", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });
});

test.describe("authenticated redirects", () => {
  test("family page redirects unauthenticated users to sign-in", async ({ page }) => {
    await page.goto("/family");
    await expect(page).toHaveURL(/sign-in/);
  });

  test("characters/new redirects unauthenticated users to sign-in", async ({ page }) => {
    await page.goto("/characters/new");
    await expect(page).toHaveURL(/sign-in/);
  });
});
