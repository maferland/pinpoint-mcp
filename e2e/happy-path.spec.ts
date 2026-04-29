import { test, expect } from "./cli-fixture.ts";

test.use({ pinpointContext: "playwright happy-path" });

test("user pins, types, hits Done — cli returns annotation JSON and exits cleanly", async ({ page, pinpointCli }) => {
  page.on("console", (msg) => console.log(`[browser ${msg.type()}]`, msg.text()));
  page.on("pageerror", (err) => console.log("[browser error]", err.message));
  await page.goto(pinpointCli.url);

  // Toolbar is the proof the page hydrated.
  await expect(page.getByText("Pinpoint", { exact: true })).toBeVisible();
  await expect(page.getByText("playwright happy-path")).toBeVisible();
  await expect(page.getByText("0 pins")).toBeVisible();

  // Drop a pin by clicking the canvas. The annotator picks the click location;
  // we just need a click somewhere over the image.
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 10000 });
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

  // Popover appears, focused.
  const textarea = page.getByTestId("popover-textarea");
  await expect(textarea).toBeFocused();

  await textarea.fill("Footer spacing too tight");

  // Wait for the debounced PUT before triggering finalize, otherwise the
  // server reads a stale (empty) annotation list.
  const annotationsSaved = page.waitForResponse((res) =>
    res.url().endsWith("/annotations") && res.request().method() === "PUT" && res.ok()
  );

  // ⌘Enter saves and closes the popover.
  await textarea.press("Meta+Enter");
  await expect(textarea).toBeHidden();
  await expect(page.getByText("1 pin")).toBeVisible();
  await annotationsSaved;

  // Click Done.
  const tFinalize = Date.now();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: /Sent/ })).toBeVisible();

  // CLI exits and prints the JSON.
  const json = await pinpointCli.finalized();
  const exitTime = Date.now() - tFinalize;

  // Keep-alive fix proof: must exit fast even with a real browser tab open.
  expect(exitTime).toBeLessThan(2500);

  expect(json.context).toBe("playwright happy-path");
  expect(json.images).toHaveLength(1);
  expect(json.annotations).toHaveLength(1);
  expect(json.annotations[0]).toMatchObject({
    number: 1,
    comment: "Footer spacing too tight",
  });
  // Pin position should land near the click point — coords are percentages.
  expect(json.annotations[0].pin.x).toBeGreaterThan(20);
  expect(json.annotations[0].pin.x).toBeLessThan(80);
  expect(json.annotations[0].pin.y).toBeGreaterThan(20);
  expect(json.annotations[0].pin.y).toBeLessThan(80);
});
