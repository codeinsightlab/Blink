// Native APIs are mocked: this proves Creator UI/contract, not macOS window effects.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.__TAURI_INTERNALS__ = {
      invoke: async () => ({ profiles: [], platform: "macos", listenerStatus: "PAUSED" }),
      transformCallback: () => 1,
      unregisterCallback: () => {},
    };
    localStorage.setItem("blink.runtime.language", "zh-CN");
  });
  await page.goto(process.env.RUNTIME_URL || "http://localhost:1420");
  async function open(platform) {
    await page.evaluate(async (platform) => {
      const { openRuntimeCreator } = await import("/src/creator.ts");
      window.savedToggle = null;
      const noop = async () => {};
      await openRuntimeCreator({
        platform,
        profiles: [],
        pause: noop,
        pickApp: async () => "/System/Applications/TextEdit.app",
        pickTarget: async () => null,
        api: {
          create: async (profile) => {
            window.savedToggle = profile;
            return "test";
          },
          bind: noop,
          remove: noop,
          resume: noop,
          refresh: noop,
          pause: noop,
        },
        finish: noop,
      });
    }, platform);
  }
  await open("macos");
  await page.keyboard.press("F10");
  await page.locator('[data-action="OPEN_APP"]').click();
  assert.equal(await page.locator('[data-action="TOGGLE_APP"]').count(), 0);
  assert.match(await page.locator(".creator-dialog").textContent(), /打开应用/);
  assert.match(await page.locator(".creator-dialog").textContent(), /应用在前台时，再按一次隐藏/);
  await page.locator("[data-pick]").click();
  assert.equal(await page.locator("#app-toggle-enabled").isChecked(), true);
  await page.locator("#app-toggle-enabled").uncheck();
  assert.match(await page.locator(".creator-target").textContent(), /TextEdit.app/);
  await page.locator("#app-toggle-enabled").check();
  await page.locator("[data-save]").click();
  await page.waitForFunction(() => window.savedToggle !== null);
  const profile = await page.evaluate(() => window.savedToggle);
  assert.equal(profile.actions[0].type, "TOGGLE_APP");
  assert.deepEqual(profile.actions[0].executions.macos, {
    type: "TOGGLE_APP",
    knownPaths: ["/System/Applications/TextEdit.app"],
  });
  await page.reload();
  await open("windows");
  await page.keyboard.press("F10");
  assert.equal(await page.locator('[data-action="TOGGLE_APP"]').count(), 0);
  await page.locator('[data-action="OPEN_APP"]').click();
  assert.equal(await page.locator("#app-toggle-enabled").count(), 0);
  console.log("Toggle Creator browser test passed (mock native APIs)");
} finally {
  await browser.close();
}
