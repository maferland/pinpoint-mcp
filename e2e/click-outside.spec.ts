import { test, expect } from "./cli-fixture.ts";

test.use({ pinpointContext: "click-outside-saves" });

test("clicking outside the popover saves the typed comment", async ({ page, pinpointCli }) => {
  await page.goto(pinpointCli.url);

  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  const cbox = await canvas.boundingBox();
  expect(cbox).not.toBeNull();

  // Drop a pin near the upper-left.
  await page.mouse.click(cbox!.x + cbox!.width * 0.3, cbox!.y + cbox!.height * 0.3);
  const textarea = page.getByTestId("popover-textarea");
  await expect(textarea).toBeFocused();
  await textarea.fill("typed but not submitted");

  // Wait for the debounced PUT after the popover unmount-save fires.
  const saved = page.waitForResponse((res) =>
    res.url().endsWith("/annotations") && res.request().method() === "PUT" && res.ok()
  );

  // Click on the canvas in a different spot to dismiss the popover. The
  // CanvasLayer treats this as "deselect" (selectedId → null) which unmounts
  // the popover and triggers our save-on-unmount flush.
  await page.mouse.click(cbox!.x + cbox!.width * 0.7, cbox!.y + cbox!.height * 0.7);
  await expect(textarea).toBeHidden();
  await saved;

  await page.getByRole("button", { name: "Done" }).click();
  const json = await pinpointCli.finalized();
  expect(json.annotations).toHaveLength(1);
  expect(json.annotations[0].comment).toBe("typed but not submitted");
});

test("Escape discards the typed draft", async ({ page, pinpointCli }) => {
  await page.goto(pinpointCli.url);

  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  const cbox = await canvas.boundingBox();
  expect(cbox).not.toBeNull();

  // Wait for the PUT triggered by addAnnotation. No second PUT will follow
  // because Escape sets cancelRef and the save-on-unmount short-circuits.
  const pinSaved = page.waitForResponse((res) =>
    res.url().endsWith("/annotations") && res.request().method() === "PUT" && res.ok()
  );

  await page.mouse.click(cbox!.x + cbox!.width / 2, cbox!.y + cbox!.height / 2);
  const textarea = page.getByTestId("popover-textarea");
  await expect(textarea).toBeFocused();
  await textarea.fill("draft to throw away");
  await textarea.press("Escape");
  await expect(textarea).toBeHidden();
  await pinSaved;

  await page.getByRole("button", { name: "Done" }).click();
  const json = await pinpointCli.finalized();
  // Pin was placed but its comment should be empty (Esc discards the draft).
  expect(json.annotations).toHaveLength(1);
  expect(json.annotations[0].comment).toBe("");
});
