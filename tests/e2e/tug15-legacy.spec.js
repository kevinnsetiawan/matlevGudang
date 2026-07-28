const { test, expect } = require("./fixtures");
const { openApp, openRoute } = require("./support/responsive");

test("TUG-15 exposes combined-history controls and material drawer", async ({ isolatedPage:page }, testInfo) => {
  await openApp(page);
  await openRoute(page, {
    tab:"transaction",
    menuPath:["TUG", "Laporan"],
    readySelector:".tug-page",
  });

  const quickInput = page.getByPlaceholder("Ketik nama material atau nomor katalog", { exact:true });
  await expect(quickInput).toBeVisible();
  await expect(page.getByPlaceholder(/Pekerjaan, lokasi, vendor\/ULTG/)).toBeVisible();
  const quickButton = page.getByRole("button", { name:"Cari / Lihat Riwayat", exact:true });
  await expect(quickButton).toBeDisabled();
  await expect(page.getByRole("button", { name:"Semua Sumber", exact:true })).toBeVisible();
  await expect(page.getByRole("button", { name:"Baru", exact:true })).toBeVisible();
  await expect(page.getByRole("button", { name:"Lama", exact:true })).toBeVisible();
  await expect(page.getByText("TUG-5", { exact:true })).toBeVisible();
  expect(await page.evaluate(() => ({
    overflow:Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
  }))).toEqual({ overflow:0 });

  await quickInput.fill("Isolator Keramik");
  await expect(quickButton).toBeEnabled();
  await quickButton.click();
  const dialog = page.getByRole("dialog", { name:"Riwayat lengkap material" });
  await expect(dialog).toBeVisible();
  await expect(page.getByText("Total masuk", { exact:true })).toBeVisible();
  await expect(page.getByText("Total keluar", { exact:true })).toBeVisible();
  await expect(dialog.getByText("Pekerjaan: Pemeliharaan Gardu Induk", { exact:true })).toBeVisible();
  await expect(dialog.getByText("Vendor/ULTG/pihak: ULTG Surabaya", { exact:true })).toBeVisible();
  const drawerLayout = await dialog.evaluate(node => {
    const drawer = node.querySelector("aside");
    const rect = drawer.getBoundingClientRect();
    return {
      withinViewport:rect.left >= 0 && rect.right <= document.documentElement.clientWidth,
      horizontalOverflow:drawer.scrollWidth - drawer.clientWidth,
    };
  });
  expect(drawerLayout.withinViewport).toBe(true);
  expect(drawerLayout.horizontalOverflow).toBeLessThanOrEqual(1);
  if (process.env.TUG15_VISUAL_AUDIT === "1") {
    await page.screenshot({ path:testInfo.outputPath("tug15-history-drawer.png"), fullPage:false });
  }
});

test("combined mutation rows keep legacy separate and search across dates", async ({ isolatedPage:page }) => {
  await openApp(page);
  const result = await page.evaluate(async () => {
    const { buildMutasiRows } = await import("/src/lib/supabaseSync.js");
    const katalog = [{ id:"KAT-1", katalog:"301234567", name:"Isolator Keramik", satuan:"BUAH" }];
    const stocks = [{ id:"ST-1", katalogId:"KAT-1", jenisBarang:"Material Cadang" }];
    const txns = [{
      id:"TX-1", docType:"TUG9", status:"APPROVED", approvedAt:new Date("2026-06-01").getTime(),
      docNumbers:{ tug9:"BARU-001" }, stockItems:[{ stockId:"ST-1", qty:2 }],
    }];
    const legacy = [{
      id:1, source_upt:"UPT Surabaya", doc_type:"TUG9", doc_id:"LAMA-001",
      tanggal:"2020-01-01", jenis_transaksi:"KELUAR", no_katalog:"301234567",
      nama_material:"Isolator Keramik", satuan:"BUAH", qty:3, sync_key:"legacy-1",
    }];
    const rows = buildMutasiRows(txns, katalog, stocks, {
      dateFrom:"2026-01-01", dateTo:"2026-12-31", katalogId:"ALL",
      jenisBarang:"ALL", sapStatus:"ALL", source:"ALL",
      searchText:"isolator", docTypes:["TUG9"],
    }, [], legacy);
    return rows.map(row => ({
      source:row.source,
      masuk:row.masuk,
      keluar:row.keluar,
      materialKey:row.materialKey,
    }));
  });

  expect(result).toHaveLength(2);
  expect(result.map(row => row.source).sort()).toEqual(["BARU", "LAMA"]);
  expect(result.find(row => row.source === "LAMA")).toMatchObject({ masuk:0, keluar:3 });
  expect(new Set(result.map(row => row.materialKey)).size).toBe(1);
});

test.describe("TUG-15 pagination and frequent history search", () => {
  const manyTxns = Array.from({ length:101 }, (_, index) => ({
    id:`TUG9-PAGE-${index + 1}`,
    docType:"TUG9",
    status:"APPROVED",
    createdAt:new Date(`2026-05-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`).getTime() + index,
    approvedAt:new Date(`2026-05-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`).getTime() + index,
    namaPekerjaan:`Pekerjaan Paging ${index + 1}`,
    lokasiPekerjaan:`GI Area ${index + 1}`,
    penerimaNama:`Tim ${index + 1}`,
    penerimaUnit:index === 100 ? "ULTG Selatan Khusus" : "ULTG Surabaya",
    docNumbers:{ tug9:`TUG-9/PAGE/${String(index + 1).padStart(3, "0")}` },
    stockItems:[{ stockId:"ST-E2E-01", qty:1 }],
  }));

  test.use({ cloudOverrides:{ pln_txns_v3:manyTxns } });

  test("pages 20/50/100 and finds history beyond the current page", async ({ isolatedPage:page }) => {
    await openApp(page);
    await openRoute(page, {
      tab:"transaction",
      menuPath:["TUG", "Laporan"],
      readySelector:".tug-page",
    });

    await expect(page.getByText("1–20 dari 101", { exact:true })).toBeVisible();
    await page.getByRole("button", { name:"Berikutnya", exact:true }).click();
    await expect(page.getByText("21–40 dari 101", { exact:true })).toBeVisible();

    await page.getByLabel("Baris per halaman", { exact:true }).selectOption("50");
    await expect(page.getByText("1–50 dari 101", { exact:true })).toBeVisible();
    await page.getByRole("button", { name:"Berikutnya", exact:true }).click();
    await expect(page.getByText("51–100 dari 101", { exact:true })).toBeVisible();
    await page.getByRole("button", { name:"Berikutnya", exact:true }).click();
    await expect(page.getByText("101–101 dari 101", { exact:true })).toBeVisible();

    await page.getByLabel("Baris per halaman", { exact:true }).selectOption("100");
    await expect(page.getByText("1–100 dari 101", { exact:true })).toBeVisible();

    const historySearch = page.getByPlaceholder(/Pekerjaan, lokasi, vendor\/ULTG/);
    await historySearch.fill("paging 101 ultg selatan");
    await expect(page.getByText("1–1 dari 1", { exact:true })).toBeVisible();
    await expect(page.getByText("Pekerjaan Paging 101", { exact:true })).toBeVisible();
  });
});

test("TUG-5 is searchable as a request and never changes saldo", async ({ isolatedPage:page }) => {
  await openApp(page);
  const result = await page.evaluate(async () => {
    const { buildMutasiRows } = await import("/src/lib/supabaseSync.js");
    return buildMutasiRows([{
      id:"TUG5-REQ-1", docType:"TUG5", status:"APPROVED", stage:"APPROVED_ULTG",
      approvedAtMgrUltg:new Date("2026-07-01").getTime(), sourceType:"ULTG", ultgId:"ULTG-1",
      namaPekerjaan:"Permintaan PMT", lokasiPekerjaan:"GI Waru",
      docNumbers:{ tug5:"TUG-5/001" }, stockItems:[{ katalogId:"KAT-1", qty:7 }],
    }], [{ id:"KAT-1", katalog:"301", name:"PMT 150 kV", satuan:"UNIT" }], [], {
      dateFrom:"", dateTo:"", katalogId:"ALL", jenisBarang:"ALL", sapStatus:"ALL",
      source:"ALL", searchText:"permintaan waru ultg selatan", docTypes:["TUG5"],
      ultgList:[{ id:"ULTG-1", nama:"ULTG Selatan" }],
    }, [], []);
  });

  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({
    eventKind:"PERMINTAAN", masuk:0, keluar:0, affectsSaldo:false,
    saldoAwal:null, saldoAkhir:null, counterparty:"ULTG Selatan",
  });
});
