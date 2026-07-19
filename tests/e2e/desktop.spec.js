const { test, expect } = require("./fixtures");
const { openApp, openRoute } = require("./support/responsive");

test.describe("WARNOTO desktop preservation smoke", () => {
  test("dashboard remains contained at 1366px", async ({ isolatedPage:page }) => {
    await openApp(page);
    const metrics = await page.evaluate(() => ({
      scrollWidth:document.documentElement.scrollWidth,
      clientWidth:document.documentElement.clientWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    await expect(page).toHaveScreenshot("dashboard-desktop.png", {
      fullPage:true, animations:"disabled", maxDiffPixelRatio:0.01,
    });
  });

  test("fleet registry remains contained at 1366px", async ({ isolatedPage:page }) => {
    await openApp(page);
    await openRoute(page, {
      tab:"heavyEquipment",
      menuPath:["Alat Berat"],
      readySelector:".heavy-equipment-page",
    });
    const metrics = await page.evaluate(() => ({
      scrollWidth:document.documentElement.scrollWidth,
      clientWidth:document.documentElement.clientWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    await expect(page).toHaveScreenshot("fleet-registry-desktop.png", {
      fullPage:true, animations:"disabled", maxDiffPixelRatio:0.01,
    });
  });
});
