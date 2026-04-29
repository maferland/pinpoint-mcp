import { test, expect } from "./cli-fixture.ts";

test.use({ pinpointContext: "auto-close" });

test("Auto-close checkbox persists in localStorage and shows countdown after Done", async ({ page, pinpointCli }) => {
  await page.goto(pinpointCli.url);

  const checkbox = page.getByRole("checkbox", { name: "Auto-close" });
  await expect(checkbox).not.toBeChecked();

  // Toggle on, verify localStorage is set.
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  const stored = await page.evaluate(() => localStorage.getItem("pinpoint:autoCloseAfterDone"));
  expect(stored).toBe("1");

  // Reload — checkbox should remember its state.
  await page.reload();
  const checkboxAfterReload = page.getByRole("checkbox", { name: "Auto-close" });
  await expect(checkboxAfterReload).toBeChecked();

  // Click Done — button should display the countdown variant.
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: /Sent — closing in \ds/ })).toBeVisible();

  // CLI should still finalize cleanly even though the page is "self-closing".
  const json = await pinpointCli.finalized();
  expect(json.context).toBe("auto-close");
  expect(json.annotations).toEqual([]);
});

test("Auto-close OFF — Done shows the static 'you can close this tab' label", async ({ page, pinpointCli }) => {
  await page.goto(pinpointCli.url);
  const checkbox = page.getByRole("checkbox", { name: "Auto-close" });
  await expect(checkbox).not.toBeChecked();

  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: "Sent — you can close this tab" })).toBeVisible();
  await pinpointCli.finalized();
});
