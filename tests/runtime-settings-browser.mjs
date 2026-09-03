// UI-only smoke test. All native calls are mocked; never quits the real Runtime.
// PLAYWRIGHT_MODULE may point to an existing installation (no new dependency needed).
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1120, height: 760 } });
  await page.addInitScript(() => {
    window.testCalls = [];
    window.testSnapshot = { profiles: [], platform: "macos", listenerStatus: "LISTENING" };
    window.__TAURI_INTERNALS__ = {
      invoke: async (command, args) => {
        window.testCalls.push({ command, args });
        if (command === "runtime_snapshot") return window.testSnapshot;
        if (command === "toggle_listener_command") {
          window.testSnapshot.listenerStatus =
            window.testSnapshot.listenerStatus === "LISTENING" ? "PAUSED" : "LISTENING";
        }
        return 1;
      },
      transformCallback: () => 1,
      unregisterCallback: () => {},
    };
    localStorage.setItem("blink.runtime.language", "zh-CN");
  });
  await page.goto(process.env.RUNTIME_URL || "http://localhost:1420");
  await page.locator('[data-page="settings"]').click();
  assert.equal(await page.locator(".settings-card").count(), 4);
  assert.equal(await page.locator(".blink-brand b").textContent(), "Blink");
  assert.equal(await page.locator(".blink-brand p").textContent(), "一键直达隐藏应用");
  for (const selector of [".main-header h1", ".blink-brand p", ".diagnostic-value"]) {
    const style = await page
      .locator(selector)
      .first()
      .evaluate((el) => {
        const css = getComputedStyle(el);
        return { cursor: css.cursor, selection: css.webkitUserSelect };
      });
    assert.deepEqual(style, { cursor: "default", selection: "none" });
  }
  assert.deepEqual(
    await page.locator(".settings-email > span").evaluate((el) => {
      const css = getComputedStyle(el);
      return { cursor: css.cursor, selection: css.webkitUserSelect };
    }),
    { cursor: "text", selection: "text" },
  );
  assert.equal(
    await page.locator("#quit").evaluate((el) => getComputedStyle(el).cursor),
    "pointer",
  );
  assert.equal(await page.locator(".settings-runtime-summary h3").textContent(), "正在监听");
  assert.equal(
    await page.locator(".settings-email > span").textContent(),
    "lixinzhang0703@gmail.com",
  );
  assert.equal(
    await page.locator(".settings-diagnostics dd").first().textContent(),
    "尚未收到已绑定快捷键",
  );
  for (const language of ["zh-CN", "en"]) {
    await page.locator("#runtime-language").selectOption(language);
    assert.equal(await page.locator("html").getAttribute("lang"), language);
    for (const [width, height] of [
      [1120, 760],
      [900, 620],
      [1493, 1015],
    ]) {
      await page.setViewportSize({ width, height });
      const overflow = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            ".settings-content, .settings-card, .blink-brand, .settings-email",
          ),
        ].some((el) => el.scrollWidth > el.clientWidth + 1),
      );
      assert.equal(overflow, false, `${language} ${width} horizontal overflow`);
      await page.locator("#quit").scrollIntoViewIfNeeded();
      assert.equal(await page.locator("#quit").isVisible(), true);
    }
  }
  await page.locator("#runtime-language").selectOption("zh-CN");
  await page.setViewportSize({ width: 1493, height: 1015 });
  await page.locator(".settings-content").evaluate((el) => {
    el.scrollTop = 0;
  });
  if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: process.env.SCREENSHOT_PATH });
  await page.setViewportSize({ width: 1120, height: 760 });
  await page.locator("#toggle-listener").click();
  await page.getByRole("heading", { name: "监听已暂停", exact: true }).waitFor();
  await page.evaluate(() => {
    window.testSnapshot.listenerStatus = "ERROR";
    window.testSnapshot.lastEvent = "<unsafe>" + "LONG_DIAGNOSTIC_".repeat(80);
    window.testSnapshot.lastError = "<img src=x onerror=alert(1)>";
  });
  await page.locator('[data-page="deck"]').click();
  await page.locator('[data-page="settings"]').click();
  // A language change renders the existing snapshot (shared mock object).
  await page.locator("#runtime-language").selectOption("en");
  assert.equal(
    await page.locator(".settings-runtime-summary h3").textContent(),
    "Listening needs attention",
  );
  assert.equal(await page.locator(".settings-diagnostics img").count(), 0);
  assert.match(await page.locator(".settings-diagnostics").textContent(), /<img src=x/);
  assert.equal(
    await page.locator(".settings-content").evaluate((el) => el.scrollWidth > el.clientWidth + 1),
    false,
  );
  await page.locator("#quit").click();
  assert.equal(
    await page.evaluate(() =>
      window.testCalls.some((call) => call.command === "quit_blink_command"),
    ),
    true,
  );
  console.log(
    "PASS: four cards, brand, real-field fallbacks, locale switching, 3 viewport sizes, paused/error states, escaped long diagnostics, quit invocation (mocked).",
  );
} finally {
  await browser.close();
}
